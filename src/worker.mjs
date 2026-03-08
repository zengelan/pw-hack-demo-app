const APP_VERSION="v0.0.1";
const APP_BRANCH_DEFAULT="main";
const APP_NAME="pw-hack-demo-app";
const MAX_HASHES=25, RATE_LIMIT_MS=500, HASHES_CACHE_TTL=5000, INDEX_KEY="__index__";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};

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
  if (KV_HASHES) await KV_HASHES.put(INDEX_KEY, JSON.stringify(ids), {expirationTtl:7200});
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

// --- Version ---
function version(env) {
  const v = env?.APP_VERSION || APP_VERSION;
  const b = env?.APP_BRANCH || APP_BRANCH_DEFAULT;
  const n = APP_NAME;
  return json({version: v, branch: b, name: n});
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
  if (!body?.hash || !body?.spaceId) return json({error: "Missing fields: hash and spaceId required."}, 400);
  if (!/^[a-f0-9]{64}$/i.test(body.hash)) return json({error: "Invalid hash. Expected SHA-256 hex."}, 400);
  const spaces = await getSpacesList();
  if (spaces.length > 0 && !spaces.some(s => s.id === body.spaceId)) return json({error: "Unknown spaceId."}, 400);
  const cf = req.cf ?? {}, id = crypto.randomUUID();
  const entry = {
    id, hash: body.hash, spaceId: body.spaceId, submitted: Date.now(),
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
  await KV_HASHES.put(id, JSON.stringify(entry), {expirationTtl:7200});
  await addToIndex(id);
  return json({id, success: true, slotsLeft: MAX_HASHES - (idx.length + 1)});
}

async function hashes() {
  const now = Date.now();
  if (_hc && (now - _ht) < HASHES_CACHE_TTL) return json(_hc);
  const idx = await getIndex();
  const rows = await Promise.all(idx.map(id => KV_HASHES.getWithMetadata(id)));
  _hc = rows.map(r => r.metadata ? JSON.parse(r.value) : null).filter(Boolean);
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
    console.log(`[${APP_NAME}@${env?.APP_VERSION || APP_VERSION}/${env?.APP_BRANCH || APP_BRANCH_DEFAULT}] ${req.method} ${p}`);

    if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: CORS});

    if (p === "/api/version" && req.method === "GET") return version(env);
    if (p === "/api/myip" && req.method === "GET") return myIp(req);
    if (p === "/api/hashes" && req.method === "GET") return hashes();
    if (p === "/api/submit" && req.method === "POST") return submit(req, env);
    if (p === "/api/clear" && req.method === "POST") return clear();
    if (p === "/api/allowlist" && req.method === "GET") return getAllowlist();
    if (p === "/api/allowlist" && req.method === "POST") return updateAllowlist(req);
    if (p === "/api/spaces" && req.method === "GET") return listSpaces();
    if (p === "/api/spaces" && req.method === "POST") return createOrUpdateSpace(req);

    const mSpace = p.match(/^\/api\/spaces\/([^/]+)$/);
    if (mSpace && req.method === "DELETE") return deleteSpace(mSpace[1]);

    const m = p.match(/^\/api\/hash\/([0-9a-f-]{36})$/i);
    if (m) {
      if (req.method === "POST") return updateHash(req, m[1]);
      if (req.method === "DELETE") return deleteHash(m[1]);
    }

    return new Response("Not found", {status: 404});
  }
};
