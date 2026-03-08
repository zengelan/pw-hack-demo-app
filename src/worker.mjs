const APP_BRANCH_DEFAULT="main";
const APP_NAME="pw-hack-demo-app";
const MAX_HASHES=25, RATE_LIMIT_MS=500, HASHES_CACHE_TTL=5000, INDEX_KEY="__index__";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};

// ---------------------------------------------------------------------------
// Password Type Dictionary — read-only, update via code deploy only
// ---------------------------------------------------------------------------
// Worker-only deployment: HTML pages deployed separately via deploy_pages workflow
const PASSWORD_TYPES = [
  {
    id: "birthday_ddmmyyyy",
    label: "Birthday (DDMMYYYY)",
    description: "An 8-digit password derived from a birth date in DDMMYYYY format (e.g. 15081990 for 15 Aug 1990). Very common choice because it is easy to remember. People may use their own birthday, a family member's, or even a descendant's (child/grandchild). Only plausible calendar dates are valid: days 01–31, months 01–12, years 1920–2026.",
    format: "DDMMYYYY",
    charSpace: "digits 0-9, constrained to plausible calendar dates",
    charSpaceSize: 10,
    length: 8,
    regex: "^(0[1-9]|[12][0-9]|3[01])(0[1-9]|1[0-2])(19[2-9][0-9]|20[0-2][0-6])$",
    regexExplained: "DD = 01-31, MM = 01-12, YYYY = 1920-2026",
    possibleValues: 38797,
    possibleValuesNote: "Approx. 365.25 days × 106 years (1920–2026), reduced for invalid day/month combos (e.g., Feb 30). This includes birthdates of ancestors, the user, and descendants. Far smaller than a full 8-digit space.",
    exampleValues: ["01011990", "24121985", "07031975", "15082020"],
    crackingHint: "Brute-forceable in milliseconds — the year range and calendar constraints reduce the space to ~39k values.",
    weaknessLevel: "very_high"
  },
  {
    id: "digits8",
    label: "8-Digit PIN (00000000–99999999)",
    description: "Any 8-digit numeric string using digits 0–9 with no constraints. Includes PINs, random numbers, and non-date patterns like 12345678 or 00000000.",
    format: "NNNNNNNN",
    charSpace: "digits 0-9",
    charSpaceSize: 10,
    length: 8,
    regex: "^[0-9]{8}$",
    regexExplained: "Exactly 8 characters, each must be a digit 0-9",
    possibleValues: 100000000,
    possibleValuesNote: "10^8 = 100,000,000 (100 million). Much larger than birthday space but still feasible for GPU-accelerated cracking.",
    exampleValues: ["00000000", "12345678", "87654321", "39471628"],
    crackingHint: "A modern GPU can exhaust all 100M combinations in seconds for unsalted SHA-256. Sequential patterns (12345678) are found near-instantly.",
    weaknessLevel: "high"
  },
  {
    id: "lowercase8",
    label: "8 Lowercase Letters (a–z)",
    description: "An 8-character password using only lowercase English letters a–z. No digits, uppercase, or special characters. Examples: password, sunshine, abcdefgh.",
    format: "llllllll",
    charSpace: "lowercase letters a-z",
    charSpaceSize: 26,
    length: 8,
    regex: "^[a-z]{8}$",
    regexExplained: "Exactly 8 characters, each must be a lowercase ASCII letter a-z",
    possibleValues: 208827064576,
    possibleValuesNote: "26^8 ≈ 208.8 billion. Significantly harder to brute-force than digits alone, but dictionary attacks on real words are still very effective.",
    exampleValues: ["password", "sunshine", "abcdefgh", "qwertyui"],
    crackingHint: "Full brute-force takes longer (~minutes on GPU), but common words and patterns are cracked instantly via dictionary attacks. No special chars means no entropy boost.",
    weaknessLevel: "medium"
  }
];

// Derived Set for O(1) validation in submit() — stays in sync with PASSWORD_TYPES automatically
const PASSWORD_TYPE_IDS = new Set(PASSWORD_TYPES.map(t => t.id));

let KV_HASHES, KV_ALLOWLIST;
let _ac=null, _at=0, _hc=null, _ht=0;

function json(d, s=200) {
  return new Response(JSON.stringify(d), {status:s, headers:{"Content-Type":"application/json", ...CORS}});
}

function esc(s="") {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").slice(0,40);
}

function initKVs(env) {
  if (!KV_HASHES) {
    KV_HASHES = env?.PWDEMOAPPHASHES;
    KV_ALLOWLIST = env?.PWDEMOAPPALLOWLIST;
  }
}

// --- Index management ---
async function getIndex() {
  if (!KV_HASHES) return [];
  const raw = await KV_HASHES.get(INDEX_KEY);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter(id => !id.startsWith("rl:")) : [];
  } catch {
    return [];
  }
}

async function saveIndex(ids) {
  if (!KV_HASHES) return json({error: "Storage backend not configured."}, 503);
  await KV_HASHES.put(INDEX_KEY, JSON.stringify(ids), {expirationTtl:7200});
}

async function addToIndex(id) {
  const idx = await getIndex();
  if (!idx.includes(id)) {
    idx.push(id);
    await saveIndex(idx);
  }
}

async function removeFromIndex(id) {
  const idx = await getIndex();
  const filtered = idx.filter(x => x !== id);
  if (filtered.length !== idx.length) await saveIndex(filtered);
}

// --- Allowlist ---
async function getRules() {
  if (_ac && Date.now() - _at < 60000) return _ac;
  const r = await KV_ALLOWLIST?.get("rules");
  _ac = parseRules(r || ""); _at = Date.now();
  return _ac;
}

function parseRules(t) {
  return t.split("\n").flatMap(l => {
    l = l.trim(); if (!l || l.startsWith("#")) return [];
    const i = l.indexOf(":"); if (i < 0) return [];
    return [{type: l.slice(0,i).trim(), value: l.slice(i+1).trim()}];
  });
}

function isV6(ip) { return ip.includes(":"); }
function ip2n(ip) { const p=ip.split(".").map(Number); return((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0; }
function cidr(ip, c) {
  if (isV6(ip)) return false;
  const [b, bits] = c.split("/");
  const m = bits ? (0xFFFFFFFF << (32 - +bits)) >>> 0 : 0xFFFFFFFF;
  return (ip2n(ip) & m) === (ip2n(b) & m);
}

async function allowed(req) {
  const rules = await getRules();
  if (!rules.length) return true;
  const cf = req.cf ?? {}, ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const ctry = (cf.country ?? "").toUpperCase(), asn = String(cf.asn ?? "");
  for (const r of rules) {
    if (r.type === "ipv6" && r.value === "allow" && isV6(ip)) return true;
    if (r.type === "country" && r.value.toUpperCase() === ctry) return true;
    if (r.type === "ip" && r.value === ip) return true;
    if (r.type === "cidr" && cidr(ip, r.value)) return true;
    if (r.type === "asn" && r.value === asn) return true;
  }
  return false;
}

async function rateLimited(ip) {
  if (!KV_HASHES) return false;
  const k = "rl:" + ip, l = await KV_HASHES.get(k);
  if (l && Date.now() - +l < RATE_LIMIT_MS) return true;
  if (!KV_HASHES) return json({error: "Storage backend not configured."}, 503);
  await KV_HASHES.put(k, String(Date.now()), {expirationTtl:60});
  return false;
}

// --- Spaces ---
const SPACES_KEY = "spaces";

async function getSpacesList() {
  const raw = await KV_ALLOWLIST?.get(SPACES_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function saveSpacesList(spaces) {
  if (KV_ALLOWLIST) await KV_ALLOWLIST.put(SPACES_KEY, JSON.stringify(spaces));
}

async function listSpaces() { return json(await getSpacesList()); }

async function createOrUpdateSpace(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !body.id.trim() || typeof body.name !== "string" || !body.name.trim()) {
    return json({error: "id and name are required"}, 400);
  }
  const spaces = await getSpacesList();
  const space = {id: body.id.trim(), name: body.name.trim(), location: body.location ?? "unknown", description: body.description ?? ""};
  const idx = spaces.findIndex(s => s.id === space.id);
  if (idx >= 0) spaces[idx] = space; else spaces.push(space);
  await saveSpacesList(spaces);
  return json({success: true, space});
}

async function deleteSpace(id) {
  const spaces = await getSpacesList();
  const filtered = spaces.filter(s => s.id !== id);
  if (filtered.length === spaces.length) return json({error: "Not found"}, 404);
  await saveSpacesList(filtered);
  return json({success: true});
}

// --- Password Types Dictionary ---
function passwordTypes() {
  return json({ types: PASSWORD_TYPES });
}

// --- Version ---
function version(env) {
  const v = env?.APP_VERSION ?? "dev";
  const b = env?.APP_BRANCH ?? APP_BRANCH_DEFAULT;
  const c = env?.APP_COMMIT ?? "unknown";
  const n = APP_NAME;
  return json({version: v, branch: b, commit: c, name: n});
}

// --- Core API ---
async function myIp(req) {
  const cf = req.cf ?? {};
  return json({
    ip: req.headers.get("CF-Connecting-IP") ?? "unknown",
    country: cf.country ?? "unknown", city: cf.city ?? "unknown", region: cf.region ?? "unknown",
    asn: cf.asn ?? "unknown", asOrganization: cf.asOrganization ?? "unknown",
    timezone: cf.timezone ?? "unknown", colo: cf.colo ?? "unknown",
    httpProtocol: cf.httpProtocol ?? "unknown", tlsVersion: cf.tlsVersion ?? "unknown",
    tlsCipher: cf.tlsCipher ?? "unknown",
    userAgent: req.headers.get("User-Agent") ?? "unknown",
    acceptLanguage: req.headers.get("Accept-Language") ?? "unknown"
  });
}

async function submit(req, env) {
  _hc = null; _ht = 0;
  if (!(await allowed(req))) {
    const cf = req.cf ?? {}, ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
    return json({
      error: "Submissions from this IP are blocked.",
      ip, country: cf.country ?? "unknown", asn: cf.asn ?? "unknown",
      asOrganization: cf.asOrganization ?? "unknown",
      hint: "Ask your instructor to add your IP to the allowlist."
    }, 403);
  }
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (await rateLimited(ip)) return json({error: "Please wait 30 seconds between submissions."}, 429);
  const idx = await getIndex();
  if (idx.length >= MAX_HASHES) return json({error: "Demo full. Max 25 submissions reached."}, 429);

  const body = await req.json().catch(() => null);
  if (!body?.hash || !body?.spaceId) {
    return json({error: "Missing fields: hash and spaceId are required."}, 400);
  }
  if (!/^[a-f0-9]{64}$/i.test(body.hash)) {
    return json({error: "Invalid hash. Expected SHA-256 hex."}, 400);
  }
  const passwordTypeId = body.passwordTypeId ?? null;
  if (passwordTypeId !== null && !PASSWORD_TYPE_IDS.has(passwordTypeId)) {
    return json({ error: "Invalid passwordTypeId.", validIds: [...PASSWORD_TYPE_IDS] }, 400);
  }

  const spaces = await getSpacesList();
  if (spaces.length > 0 && !spaces.some(s => s.id === body.spaceId)) {
    return json({error: "Unknown spaceId."}, 400);
  }

  const cf = req.cf ?? {}, id = crypto.randomUUID();
  const entry = {
    id,
    hash: body.hash,
    spaceId: body.spaceId,
    passwordTypeId: passwordTypeId,
    submitted: Date.now(),
    cracked: false, attempts: 0, password: null, crackedAt: null,
    meta: {
      ip, country: cf.country ?? "unknown", city: cf.city ?? "unknown",
      region: cf.region ?? "unknown", postalCode: cf.postalCode ?? "unknown",
      latitude: cf.latitude ?? "unknown", longitude: cf.longitude ?? "unknown",
      asn: cf.asn ?? "unknown", asOrganization: cf.asOrganization ?? "unknown",
      timezone: cf.timezone ?? "unknown", colo: cf.colo ?? "unknown",
      httpProtocol: cf.httpProtocol ?? "unknown", tlsVersion: cf.tlsVersion ?? "unknown",
      tlsCipher: cf.tlsCipher ?? "unknown",
      userAgent: req.headers.get("User-Agent") ?? "unknown",
      acceptLanguage: req.headers.get("Accept-Language") ?? "unknown",
      referer: req.headers.get("Referer") ?? "none",
      rayId: req.headers.get("Cf-Ray") ?? "unknown",
      client: body.meta ?? {}
    }
  };
  if (!KV_HASHES) return json({error: "Storage backend not configured."}, 503);
  await KV_HASHES.put(id, JSON.stringify(entry), {expirationTtl:7200});
  await addToIndex(id);
  return json({id, success: true, slotsLeft: MAX_HASHES - (idx.length + 1)});
}

async function hashes() {
  const now = Date.now();
  if (_hc && (now - _ht) < HASHES_CACHE_TTL) return json(_hc);
  const idx = await getIndex();
  const rows = await Promise.all(idx.map(id => KV_HASHES.getWithMetadata(id)));
  _hc = rows.map(r => r.value ? JSON.parse(r.value) : null).filter(Boolean);
  _ht = now;
  return json(_hc);
}

async function updateHash(req, id) {
  _hc = null; _ht = 0;
  const e = await KV_HASHES.getWithMetadata(id);
  if (!e || !e.metadata) return json({error: "Not found."}, 404);
  const entry = JSON.parse(e.value);
  const b = await req.json().catch(() => ({}));
  const updated = {...entry, cracked: true, password: esc(b.password ?? ""), attempts: b.attempts ?? 0, crackedAt: Date.now()};
  if (!KV_HASHES) return json({error: "Storage backend not configured."}, 503);
  await KV_HASHES.put(id, JSON.stringify(updated), {expirationTtl:7200});
  return json({success: true});
}

async function deleteHash(id) {
  _hc = null; _ht = 0;
  await KV_HASHES.delete(id);
  await removeFromIndex(id);
  return json({success: true});
}

async function clear() {
  _hc = null; _ht = 0;
  const idx = await getIndex();
  await Promise.all(idx.map(id => KV_HASHES.delete(id)));
  await KV_HASHES.delete(INDEX_KEY);
  return json({cleared: idx.length});
}

async function getAllowlist() {
  return json({rules: await KV_ALLOWLIST?.get("rules") ?? ""});
}

async function updateAllowlist(req) {
  const b = await req.json().catch(() => null);
  if (typeof b?.rules !== "string") return json({error: "Missing rules."}, 400);
  if (KV_ALLOWLIST) await KV_ALLOWLIST.put("rules", b.rules);
  _ac = null;
  return json({success: true});
}

export default {
  async fetch(req, env) {
    initKVs(env);
    const url = new URL(req.url), p = url.pathname;
    console.log(`[${APP_NAME}@${env?.APP_VERSION ?? "dev"}/${env?.APP_BRANCH ?? APP_BRANCH_DEFAULT}] ${req.method} ${p}`);

    if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: CORS});

    if (p === "/api/version"        && req.method === "GET")    return version(env);
    if (p === "/api/myip"           && req.method === "GET")    return myIp(req);
    if (p === "/api/password-types" && req.method === "GET")    return passwordTypes();
    if (p === "/api/hashes"         && req.method === "GET")    return hashes();
    if (p === "/api/submit"         && req.method === "POST")   return submit(req, env);
    if (p === "/api/clear"          && req.method === "POST")   return clear();
    if (p === "/api/allowlist"      && req.method === "GET")    return getAllowlist();
    if (p === "/api/allowlist"      && req.method === "POST")   return updateAllowlist(req);
    if (p === "/api/spaces"         && req.method === "GET")    return listSpaces();
    if (p === "/api/spaces"         && req.method === "POST")   return createOrUpdateSpace(req);

    const mSpace = p.match(/^\/api\/spaces\/([^/]+)$/);
    if (mSpace && req.method === "DELETE") return deleteSpace(mSpace[1]);

    const m = p.match(/^\/api\/hash\/([0-9a-f-]{36})$/i);
    if (m) {
      if (req.method === "POST")   return updateHash(req, m[1]);
      if (req.method === "DELETE") return deleteHash(m[1]);
    }

    return new Response("Not found", {status: 404});
  }
};
