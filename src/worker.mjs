const APP_BRANCH_DEFAULT="main";
const APP_NAME="pw-hack-demo-app";
const MAX_HASHES=50, RATE_LIMIT_MS=500, HASHES_CACHE_TTL=5000, INDEX_KEY="__index__";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};

// ---------------------------------------------------------------------------
// Password Type Dictionary — read-only, update via code deploy only
// ---------------------------------------------------------------------------
const PASSWORD_TYPES = [
  {
    id: "birthday",
    label: "Birthday (DDMMYYYY)",
    description: "An 8-digit password derived from a birth date in DDMMYYYY format (e.g. 15081990 for 15 Aug 1990). Very common choice because it is easy to remember. People may use their own birthday, a family member's, or even a descendant's (child/grandchild). Only plausible calendar dates are valid: days 01–31, months 01–12, years 1920–2050 (131 years).",
    format: "DDMMYYYY",
    charSpace: "digits 0-9, constrained to plausible calendar dates",
    charSpaceSize: 10,
    length: 8,
    regex: "^(0[1-9]|[12][0-9]|3[01])(0[1-9]|1[0-2])(19[2-9][0-9]|200[0-9]|201[0-9]|202[0-9]|203[0-9]|204[0-9]|2050)$",
    regexExplained: "DD = 01-31, MM = 01-12, YYYY = 1920-2050",
    possibleValues: 47848,
    possibleValuesNote: "47,848 valid calendar dates (1920–2050, 131 years).",
    exampleValues: ["01011990", "24121985", "07031975", "15082020"],
    crackingHint: "Brute-forceable in milliseconds — the year range and calendar constraints reduce the space to ~47.8k values.",
    weaknessLevel: "very_high",
    bruteForceStrategy: {
      method: "calendar_iteration",
      description: "Iterate all valid calendar dates in DDMMYYYY format",
      estimatedAttempts: 47848,
      estimatedTimeMs: 48,
      estimatedTimeGpuMs: 2,
      order: "descending_year",
      parameters: { yearStart: 2050, yearEnd: 1920, direction: "backward" },
      generatorType: "calendar",
      generatorConfig: { yearRange: [1920, 2050], orderBy: "year_desc" },
      dictionarySupport: false,
      truncationSupport: false,
      gpuShaderHint: "Use compute shader with parallel date validation. Split year ranges across workgroups."
    }
  },
  {
    id: "digits8",
    label: "8-Digit PIN (00000000–99999999)",
    description: "Any 8-digit numeric string using digits 0–9 with no constraints.",
    format: "NNNNNNNN",
    charSpace: "digits 0-9",
    charSpaceSize: 10,
    length: 8,
    regex: "^[0-9]{8}$",
    regexExplained: "Exactly 8 characters, each must be a digit 0-9",
    possibleValues: 100000000,
    possibleValuesNote: "10^8 = 100,000,000 (100 million).",
    exampleValues: ["00000000", "12345678", "87654321", "39471628"],
    crackingHint: "A modern GPU can exhaust all 100M combinations in seconds for unsalted SHA-256.",
    weaknessLevel: "high",
    bruteForceStrategy: {
      method: "sequential_numeric",
      description: "Iterate 00000000 to 99999999 sequentially",
      estimatedAttempts: 100000000,
      estimatedTimeMs: 100000,
      estimatedTimeGpuMs: 4500,
      order: "ascending",
      parameters: { start: 0, end: 99999999, padLength: 8 },
      generatorType: "numeric_range",
      generatorConfig: { min: 0, max: 99999999, padding: 8 },
      dictionarySupport: true,
      dictionaryUrls: [
        "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/best1050.txt",
        "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/xato-net-10-million-passwords-100000.txt",
        "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt"
      ],
      dictionaryFilterRegex: "^[0-9]{8}$",
      dictionaryNote: "Try common PINs before full brute-force.",
      truncationSupport: true,
      truncationModes: [
        { name: "first_1M",  limit: 1000000,   description: "Try first 1 million" },
        { name: "first_10M", limit: 10000000,  description: "Try first 10 million" },
        { name: "full",      limit: 100000000, description: "Full space (100M)" }
      ],
      defaultTruncationMode: "first_10M",
      gpuShaderHint: "Trivial parallel iteration. Split range across workgroups."
    }
  },
  {
    id: "lowercase8",
    label: "8 Lowercase Letters (a–z)",
    description: "An 8-character password using only lowercase English letters a–z.",
    format: "llllllll",
    charSpace: "lowercase letters a-z",
    charSpaceSize: 26,
    length: 8,
    regex: "^[a-z]{8}$",
    regexExplained: "Exactly 8 characters, each must be a lowercase ASCII letter a-z",
    possibleValues: 208827064576,
    possibleValuesNote: "26^8 ≈ 208.8 billion.",
    exampleValues: ["password", "sunshine", "abcdefgh", "qwertyui"],
    crackingHint: "Dictionary attacks on real words are very effective.",
    weaknessLevel: "medium",
    bruteForceStrategy: {
      method: "combinatorial_iteration",
      description: "Iterate all 26^8 combinations of lowercase letters",
      estimatedAttempts: 208827064576,
      estimatedTimeMs: 208827064,
      estimatedTimeGpuMs: 9492,
      order: "lexicographic",
      parameters: { charset: "abcdefghijklmnopqrstuvwxyz", length: 8, startFrom: "aaaaaaaa" },
      generatorType: "combinatorial",
      generatorConfig: { alphabet: "abcdefghijklmnopqrstuvwxyz", length: 8, orderType: "lexicographic" },
      dictionarySupport: true,
      dictionaryUrls: [
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt",
        "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt",
        "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"
      ],
      dictionaryFilterRegex: "^[a-z]{8}$",
      dictionaryNote: "STRONGLY RECOMMENDED: Try dictionary first.",
      dictionaryPriority: "required",
      truncationSupport: true,
      truncationModes: [
        { name: "dictionary_only", limit: 0,            description: "Dictionary attack only" },
        { name: "first_1M",        limit: 1000000,      description: "Dictionary + first 1M" },
        { name: "first_100M",      limit: 100000000,    description: "Dictionary + first 100M" },
        { name: "full",            limit: 208827064576, description: "Full space (209B)" }
      ],
      defaultTruncationMode: "first_1M",
      gpuShaderHint: "Use parallel base-26 counter. Each workgroup handles range."
    }
  },
  {
    id: "alphanumeric8",
    label: "8-Char Alphanumeric (a-z, A-Z, 0-9)",
    description: "An 8-character password using lowercase, uppercase letters and digits.",
    format: "aAbB12cC",
    charSpace: "alphanumeric: a-z, A-Z, 0-9",
    charSpaceSize: 62,
    length: 8,
    regex: "^[a-zA-Z0-9]{8}$",
    regexExplained: "Exactly 8 characters, each must be a-z, A-Z, or 0-9",
    possibleValues: 218340105584896,
    possibleValuesNote: "62^8 ≈ 218.3 trillion.",
    exampleValues: ["Admin123", "Pass2024", "Test1234", "aB3xY9z1"],
    crackingHint: "Full brute-force takes ~2.8 hours on RTX 4090. Common patterns instant via dictionary.",
    weaknessLevel: "medium",
    bruteForceStrategy: {
      method: "combinatorial_iteration",
      description: "Iterate all 62^8 combinations of alphanumeric characters",
      estimatedAttempts: 218340105584896,
      estimatedTimeMs: 218340105584,
      estimatedTimeGpuMs: 9924550,
      order: "lexicographic",
      parameters: { charset: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", length: 8, startFrom: "aaaaaaaa" },
      generatorType: "combinatorial",
      generatorConfig: { alphabet: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", length: 8, orderType: "lexicographic" },
      dictionarySupport: true,
      dictionaryUrls: [
        "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/best1050.txt",
        "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Leaked-Databases/rockyou-75.txt",
        // Fixed: was Passwords/probable-v2-wpa-top4800.txt (404). Correct source is berzerk0/Probable-Wordlists
        "https://raw.githubusercontent.com/berzerk0/Probable-Wordlists/master/Real-Passwords/WPA-Length/Top4800-WPA-probable-v2.txt",
        "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt"
      ],
      dictionaryFilterRegex: "^[a-zA-Z0-9]{8}$",
      dictionaryNote: "STRONGLY RECOMMENDED: Try dictionary first.",
      dictionaryPriority: "high",
      truncationSupport: true,
      truncationModes: [
        { name: "dictionary_only", limit: 0,               description: "Dictionary attack only" },
        { name: "first_100M",      limit: 100000000,       description: "Dictionary + first 100M" },
        { name: "first_1B",        limit: 1000000000,      description: "Dictionary + first 1B" },
        { name: "full",            limit: 218340105584896, description: "Full space (218T)" }
      ],
      defaultTruncationMode: "dictionary_only",
      gpuShaderHint: "Use parallel base-62 counter. Still takes ~2.8 hours on RTX 4090."
    }
  }
];

const PASSWORD_TYPE_IDS = new Set(PASSWORD_TYPES.map(t => t.id));

// ---------------------------------------------------------------------------
// GPU Cracker Python Template (inlined — Workers cannot fetch() own origin)
// ---------------------------------------------------------------------------
const GPU_CRACKER_TEMPLATE = `#!/usr/bin/env python3
"""
GPU Password Cracker Export
Generated by pw-hack-demo-app Instructor Dashboard

This script contains uncracked password hashes and their metadata.
Run with hashcat or custom GPU implementation for high-speed cracking.

Requirements:
    - Python 3.8+
    - hashcat (recommended) or custom GPU implementation
    - CUDA/OpenCL drivers for GPU acceleration

Usage:
    # With hashcat (automatic GPU detection):
    python gpu-cracker-template.py --mode hashcat
    
    # Check status:
    python gpu-cracker-template.py --status
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

# ============================================================================
# INJECTED DATA
# ============================================================================

HASHES_TO_CRACK = """{{HASHES_JSON}}"""

PASSWORD_TYPES_METADATA = """{{PASSWORD_TYPES_JSON}}"""

EXPORT_METADATA = """{{EXPORT_METADATA_JSON}}"""

SERVER_URL = "{{SERVER_URL}}"

# ============================================================================
# Data Models
# ============================================================================

@dataclass
class HashEntry:
    id: str
    hash: str
    password_type_id: str
    space_id: str
    submitted: int
    attempts_so_far: int
    meta: Dict[str, Any]

    @classmethod
    def from_dict(cls, data: Dict) -> 'HashEntry':
        return cls(
            id=data['id'],
            hash=data['hash'],
            password_type_id=data.get('passwordTypeId', 'unknown'),
            space_id=data['spaceId'],
            submitted=data['submitted'],
            attempts_so_far=data.get('attempts', 0),
            meta=data.get('meta', {})
        )

@dataclass
class PasswordTypeStrategy:
    id: str
    label: str
    format: str
    char_space: str
    length: int
    possible_values: int
    brute_force_strategy: Dict[str, Any]

    @classmethod
    def from_dict(cls, data: Dict) -> 'PasswordTypeStrategy':
        return cls(
            id=data['id'],
            label=data['label'],
            format=data['format'],
            char_space=data['charSpace'],
            length=data['length'],
            possible_values=data['possibleValues'],
            brute_force_strategy=data['bruteForceStrategy']
        )

@dataclass
class ExportMetadata:
    export_id: str
    export_timestamp: str
    total_submissions: int
    cracked_count: int
    remaining_count: int
    browser_attempts: int
    stopped_reason: str

    @classmethod
    def from_dict(cls, data: Dict) -> 'ExportMetadata':
        return cls(
            export_id=data['exportId'],
            export_timestamp=data['exportTimestamp'],
            total_submissions=data['totalSubmissions'],
            cracked_count=data['crackedCount'],
            remaining_count=data['remainingCount'],
            browser_attempts=data.get('browserAttempts', 0),
            stopped_reason=data.get('stoppedReason', 'unknown')
        )

# ============================================================================
# Load Injected Data
# ============================================================================

def load_data():
    try:
        hashes_data  = json.loads(HASHES_TO_CRACK)
        types_data   = json.loads(PASSWORD_TYPES_METADATA)
        export_data  = json.loads(EXPORT_METADATA)
        hashes         = [HashEntry.from_dict(h) for h in hashes_data]
        password_types = {t['id']: PasswordTypeStrategy.from_dict(t) for t in types_data}
        metadata       = ExportMetadata.from_dict(export_data)
        return hashes, password_types, metadata
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse injected data: {e}", file=sys.stderr)
        sys.exit(1)

# ============================================================================
# Hashcat Integration
# ============================================================================

class HashcatCracker:
    def __init__(self, workdir: Path = Path('./hashcat_work')):
        self.workdir = workdir
        self.workdir.mkdir(exist_ok=True)
        self.hashcat_binary = self._find_hashcat()

    def _find_hashcat(self) -> Optional[str]:
        for cmd in ['hashcat', 'hashcat.bin', '/usr/bin/hashcat']:
            try:
                r = subprocess.run([cmd, '--version'], capture_output=True, timeout=5)
                if r.returncode == 0:
                    return cmd
            except (FileNotFoundError, subprocess.TimeoutExpired):
                continue
        return None

    def check_available(self) -> bool:
        if not self.hashcat_binary:
            print("ERROR: hashcat not found. Install: https://hashcat.net/hashcat/", file=sys.stderr)
            return False
        print(f"Found hashcat: {self.hashcat_binary}")
        try:
            r = subprocess.run([self.hashcat_binary, '-I'], capture_output=True, text=True, timeout=10)
            print("Available GPU devices:")
            print(r.stdout)
            return True
        except subprocess.TimeoutExpired:
            print("WARNING: hashcat device query timed out", file=sys.stderr)
            return False

    def crack_password_type(self, hashes: List[HashEntry], password_type: PasswordTypeStrategy,
                            gpu_ids: Optional[List[int]] = None) -> Dict[str, str]:
        strategy = password_type.brute_force_strategy
        results  = {}

        print(f"\\n{'='*60}")
        print(f"Type: {password_type.label}")
        print(f"Format: {password_type.format}  |  Space: {password_type.char_space}")
        print(f"Hashes: {len(hashes)}  |  Combinations: {password_type.possible_values:,}")
        print(f"{'='*60}")

        hash_file = self.workdir / f'hashes_{password_type.id}.txt'
        with open(hash_file, 'w') as f:
            for h in hashes:
                f.write(f"{h.hash}\\n")

        mask_info = self._build_hashcat_mask(password_type)
        if not mask_info:
            print(f"  WARNING: No hashcat mask for {password_type.id}")
            print(f"  Hint: {strategy.get('gpuShaderHint', 'n/a')}")
            return results

        mask, extra_args = mask_info
        print(f"  Mask: {mask}")
        eta = password_type.possible_values / 22_000_000_000
        print(f"  Estimated time (RTX 4090): {eta:.2f}s")

        outfile = self.workdir / f'cracked_{password_type.id}.txt'
        cmd = [
            self.hashcat_binary,
            '-m', '1400',      # SHA-256
            '-a', '3',         # Mask attack
            '-o', str(outfile),
            '--outfile-format', '2',
            str(hash_file)
        ] + extra_args + [mask]

        if gpu_ids:
            cmd.extend(['-d', ','.join(map(str, gpu_ids))])

        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
            print(r.stdout)
            if outfile.exists():
                with open(outfile) as f:
                    for line in f:
                        if ':' in line:
                            h_val, pwd = line.strip().split(':', 1)
                            results[h_val] = pwd
                print(f"  Cracked: {len(results)} passwords")
        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT: Brute-force took >2 hours")
        except Exception as e:
            print(f"  ERROR: {e}")

        return results

    def _build_hashcat_mask(self, password_type: PasswordTypeStrategy):
        """Returns (mask_string, extra_args_list) or None."""
        t = password_type.id
        l = password_type.length
        if t == 'birthday':
            print("  WARNING: Birthday uses full 8-digit space (~100M); calendar validation not supported in hashcat masks.")
            return ('?d' * l, [])
        if t == 'digits8':
            return ('?d' * l, [])
        if t == 'lowercase8':
            return ('?l' * l, [])
        if t == 'alphanumeric8':
            # Custom charset 1 = a-z + A-Z + 0-9
            return ('?1' * l, ['-1', '?l?u?d'])
        return None

# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description='GPU Password Cracker — exported from pw-hack-demo-app')
    parser.add_argument('--mode', choices=['hashcat', 'custom'], default='hashcat')
    parser.add_argument('--gpu-ids', type=str, help='Comma-separated GPU IDs (e.g. 0,1)')
    parser.add_argument('--status', action='store_true', help='Show metadata and exit')
    args = parser.parse_args()

    print("Loading exported data...")
    hashes, password_types, meta = load_data()

    print(f"\\n{'='*60}")
    print(f"GPU Password Cracker Export")
    print(f"Export ID  : {meta.export_id}")
    print(f"Timestamp  : {meta.export_timestamp}")
    print(f"Total      : {meta.total_submissions}  Cracked: {meta.cracked_count}  Remaining: {meta.remaining_count}")
    print(f"Browser    : {meta.browser_attempts:,} attempts  Stopped: {meta.stopped_reason}")
    print(f"{'='*60}\\n")

    if args.status:
        by_type = {}
        for h in hashes:
            by_type.setdefault(h.password_type_id, []).append(h)
        print("Breakdown by type:")
        for tid, ths in by_type.items():
            pt = password_types.get(tid)
            label = pt.label if pt else tid
            space = f"{pt.possible_values:,}" if pt else "unknown"
            print(f"  {label}: {len(ths)} hashes  ({space} combinations)")
        return

    gpu_ids = [int(x.strip()) for x in args.gpu_ids.split(',')] if args.gpu_ids else None

    if args.mode == 'hashcat':
        cracker = HashcatCracker()
        if not cracker.check_available():
            sys.exit(1)
    else:
        print("Custom GPU cracker not yet implemented — use --mode hashcat")
        sys.exit(1)

    hashes_by_type = {}
    for h in hashes:
        hashes_by_type.setdefault(h.password_type_id, []).append(h)

    all_results = {}
    t0 = time.time()

    for tid, ths in hashes_by_type.items():
        pt = password_types.get(tid)
        if not pt:
            print(f"WARNING: Unknown type '{tid}', skipping {len(ths)} hashes")
            continue
        all_results.update(cracker.crack_password_type(ths, pt, gpu_ids=gpu_ids))

    duration = time.time() - t0

    print(f"\\n{'='*60}")
    print(f"RESULTS: {len(all_results)} / {len(hashes)} cracked in {duration:.2f}s")
    print(f"{'='*60}")

    results_file = Path('./cracked_results.json')
    with open(results_file, 'w') as f:
        json.dump({
            'exportId': meta.export_id,
            'crackedCount': len(all_results),
            'duration': duration,
            'results': [{'hash': h, 'password': p} for h, p in all_results.items()]
        }, f, indent=2)

    print(f"Results saved to: {results_file}")
    print(f"Server: {SERVER_URL}")

if __name__ == '__main__':
    main()
`;

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

async function getIndex() {
  if (!KV_HASHES) return [];
  const raw = await KV_HASHES.get(INDEX_KEY);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter(id => !id.startsWith("rl:")) : [];
  } catch { return []; }
}

async function saveIndex(ids) {
  if (!KV_HASHES) return json({error: "Storage backend not configured."}, 503);
  await KV_HASHES.put(INDEX_KEY, JSON.stringify(ids), {expirationTtl:7200});
}

async function addToIndex(id) {
  const idx = await getIndex();
  if (!idx.includes(id)) { idx.push(id); await saveIndex(idx); }
}

async function removeFromIndex(id) {
  const idx = await getIndex();
  const filtered = idx.filter(x => x !== id);
  if (filtered.length !== idx.length) await saveIndex(filtered);
}

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

function passwordTypes() {
  return json({ types: PASSWORD_TYPES });
}

// --- GPU Export (template inlined — no fetch() required) ---
async function exportGpuScript(req) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.remainingHashes)) {
    return json({error: 'Missing remainingHashes array'}, 400);
  }

  const { remainingHashes, exportMetadata } = body;

  const hashDetails = await Promise.all(
    remainingHashes.map(async (hashId) => {
      const value = await KV_HASHES.get(hashId);
      return value ? JSON.parse(value) : null;
    })
  );

  const validHashes = hashDetails.filter(Boolean);
  if (validHashes.length === 0) {
    return json({error: 'No valid hashes found for provided IDs'}, 400);
  }

  const exportId        = crypto.randomUUID();
  const exportTimestamp = new Date().toISOString();
  const metadata = {
    exportId,
    exportTimestamp,
    instructorSession: exportMetadata?.instructorSession || 'unknown',
    totalSubmissions:  exportMetadata?.totalSubmissions  || 0,
    crackedCount:      exportMetadata?.crackedCount      || 0,
    remainingCount:    validHashes.length,
    browserAttempts:   exportMetadata?.browserAttempts   || 0,
    browserDurationMs: exportMetadata?.browserDurationMs || 0,
    stoppedReason:     exportMetadata?.stoppedReason     || 'user_stop'
  };

  const serverUrl = new URL(req.url).origin;

  const script = GPU_CRACKER_TEMPLATE
    .replace('{{HASHES_JSON}}',         JSON.stringify(validHashes, null, 2))
    .replace('{{PASSWORD_TYPES_JSON}}', JSON.stringify(PASSWORD_TYPES, null, 2))
    .replace('{{EXPORT_METADATA_JSON}}',JSON.stringify(metadata, null, 2))
    .replace('{{SERVER_URL}}',          serverUrl);

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/x-python',
      'Content-Disposition': `attachment; filename="gpu-cracker-${exportId.substring(0, 8)}.py"`,
      ...CORS
    }
  });
}

function version(env) {
  return json({version: env?.APP_VERSION ?? "dev", branch: env?.APP_BRANCH ?? APP_BRANCH_DEFAULT, commit: env?.APP_COMMIT ?? "unknown", name: APP_NAME});
}

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
    return json({ error: "Submissions from this IP are blocked.", ip, country: cf.country ?? "unknown", asn: cf.asn ?? "unknown", asOrganization: cf.asOrganization ?? "unknown", hint: "Ask your instructor to add your IP to the allowlist." }, 403);
  }
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (await rateLimited(ip)) return json({error: "Please wait 30 seconds between submissions."}, 429);
  const idx = await getIndex();
  if (idx.length >= MAX_HASHES) return json({error: "Demo full. Max 50 submissions reached."}, 429);

  const body = await req.json().catch(() => null);
  if (!body?.hash || !body?.spaceId) return json({error: "Missing fields: hash and spaceId are required."}, 400);
  if (!/^[a-f0-9]{64}$/i.test(body.hash)) return json({error: "Invalid hash. Expected SHA-256 hex."}, 400);

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
    id, hash: body.hash, spaceId: body.spaceId, passwordTypeId,
    submitted: Date.now(), cracked: false, attempts: 0, password: null, crackedAt: null, crackDurationMs: null,
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
  const idx  = await getIndex();
  const rows = await Promise.all(idx.map(id => KV_HASHES.get(id)));
  _hc = rows.map(r => r ? JSON.parse(r) : null).filter(Boolean);
  _ht = now;
  return json(_hc);
}

async function crackHash(req, id) {
  _hc = null; _ht = 0;
  if (!KV_HASHES) return json({error: "Storage backend not configured."}, 503);
  const raw = await KV_HASHES.get(id);
  if (!raw) return json({error: "Hash not found."}, 404);
  const entry = JSON.parse(raw);
  const body  = await req.json().catch(() => ({}));
  const updated = { ...entry, cracked: true, password: esc(body.password ?? ""), attempts: body.attempts ?? 0, crackedAt: body.crackedAt ?? Date.now(), crackDurationMs: body.crackDurationMs ?? 0 };
  await KV_HASHES.put(id, JSON.stringify(updated), {expirationTtl:7200});
  return json({success: true});
}

async function updateHash(req, id) {
  _hc = null; _ht = 0;
  const raw = await KV_HASHES.get(id);
  if (!raw) return json({error: "Not found."}, 404);
  const entry = JSON.parse(raw);
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

    if (p === "/api/version"           && req.method === "GET")  return version(env);
    if (p === "/api/myip"              && req.method === "GET")  return myIp(req);
    if (p === "/api/password-types"    && req.method === "GET")  return passwordTypes();
    if (p === "/api/hashes"            && req.method === "GET")  return hashes();
    if (p === "/api/submit"            && req.method === "POST") return submit(req, env);
    if (p === "/api/clear"             && req.method === "POST") return clear();
    if (p === "/api/allowlist"         && req.method === "GET")  return getAllowlist();
    if (p === "/api/allowlist"         && req.method === "POST") return updateAllowlist(req);
    if (p === "/api/spaces"            && req.method === "GET")  return listSpaces();
    if (p === "/api/spaces"            && req.method === "POST") return createOrUpdateSpace(req);
    if (p === "/api/export-gpu-script" && req.method === "POST") return exportGpuScript(req);

    const mSpace = p.match(/^\/api\/spaces\/([^/]+)$/);
    if (mSpace && req.method === "DELETE") return deleteSpace(mSpace[1]);

    const mCrack = p.match(/^\/api\/crack\/([0-9a-f-]{36})$/i);
    if (mCrack && req.method === "POST") return crackHash(req, mCrack[1]);

    const m = p.match(/^\/api\/hash\/([0-9a-f-]{36})$/i);
    if (m) {
      if (req.method === "POST")   return updateHash(req, m[1]);
      if (req.method === "DELETE") return deleteHash(m[1]);
    }

    return new Response("Not found", {status: 404});
  }
};
