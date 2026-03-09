# 🔐 pw-hack-demo-app

> **⚠️ Educational Use Only** — This app intentionally demonstrates *insecure* password storage to teach why proper hashing and salting matters. Do **not** use these patterns in any real system.

A live classroom demo tool that shows students **how easily weak, unsalted SHA-256 password hashes can be cracked** using brute-force or dictionary attacks. Students submit their hashed passwords; the instructor (or the students themselves) crack them in real time using tools like [CrackStation](https://crackstation.net) or [Hashcat](https://hashcat.net) — making the lesson unforgettable.

**Live demo:** [https://pw-hack-demo-app.andreas-zengel.workers.dev/](https://pw-hack-demo-app.andreas-zengel.workers.dev/)  
**Custom domain:** [https://pw-hack-demo.apps.zengel.cloud/](https://pw-hack-demo.apps.zengel.cloud/)

**Cloudflare Dashboards:**
- **Pages:** [https://dash.cloudflare.com/941962c9311eef365b254a2c6eea3e58/pages/view/pw-hack-demo](https://dash.cloudflare.com/941962c9311eef365b254a2c6eea3e58/pages/view/pw-hack-demo)
- **Workers:** [https://dash.cloudflare.com/941962c9311eef365b254a2c6eea3e58/workers/services/view/pw-hack-demo-app/production](https://dash.cloudflare.com/941962c9311eef365b254a2c6eea3e58/workers/services/view/pw-hack-demo-app/production)

---

## 📚 Table of Contents

- [What This Demo Shows](#-what-this-demo-shows)
- [Architecture Overview](#-architecture-overview)
- [Project Structure](#-project-structure)
- [Pages & UI](#-pages--ui)
- [API Reference](#-api-reference)
- [Access Control & Allowlist](#-access-control--allowlist)
- [Spaces (Group Management)](#-spaces-group-management)
- [Rate Limiting](#-rate-limiting)
- [KV Storage](#-kv-storage)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Local Development](#-local-development)
- [Deployment](#-deployment)
- [Required GitHub Secrets](#-required-github-secrets)
- [Security Notice](#-security-notice)
- [License](#-license)

---

## 🎓 What This Demo Shows

| Scenario | What Students Learn |
|---|---|
| Simple password → SHA-256 hash | Hash functions are deterministic — same password always yields the same hash |
| Weak/common passwords cracked instantly | Rainbow tables and dictionary attacks exploit unsalted hashes trivially |
| Strong/random passwords resist cracking | Length, complexity, and entropy significantly raise the cost of cracking |
| bcrypt / Argon2 with a unique salt | Why modern password storage is designed to be slow and resistant to these attacks |

**The core lesson:** a SHA-256 hash without a salt is not password storage — it is an open invitation to crack.

---

## 🏗 Architecture Overview

```
Browser (Student)          Browser (Instructor)
     │                           │
     ▼                           ▼
 public/index.html        public/instructor.html
     │                           │
     └──────────┬────────────────┘
                ▼
     Cloudflare Worker  (src/worker.mjs)
                │
     ┌──────────┴──────────────────┐
     ▼                             ▼
PWDEMOAPPHASHES KV          PWDEMOAPPALLOWLIST KV
(hash entries, index,       (allowlist rules,
 rate-limit state)           spaces config)
```

- **Runtime:** Cloudflare Workers (V8 isolate, serverless edge)
- **Storage:** Two Cloudflare KV namespaces (see [KV Storage](#-kv-storage))
- **Frontend:** Static HTML/CSS/JS served via Cloudflare Assets
- **CI/CD:** GitHub Actions → Wrangler → Cloudflare (auto-deploy on every push to `main`)

---

## 📁 Project Structure

```
pw-hack-demo-app/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions CI/CD — auto-deploys on push to main
├── public/
│   ├── index.html              # Student-facing page (submit hash, live leaderboard)
│   ├── instructor.html         # Instructor control panel
│   ├── css/                    # Stylesheets
│   ├── js/                     # Frontend JavaScript
│   ├── logo.png                # App logo
│   └── qr.png                  # QR code for sharing the demo URL in class
├── src/
│   └── worker.mjs              # Cloudflare Worker — all backend logic and API routes
├── allowlist.txt               # Example allowlist rules (documentation/reference)
├── package.json                # Node.js project manifest (dev dependency: wrangler)
├── wrangler.toml               # Cloudflare Workers configuration
└── README.md
```

---

## 🖥 Pages & UI

### Student Page (`/` → `index.html`)

Students open this page on their own device using the live URL or the QR code projected in class.

**Flow:**
1. Student enters a password of their choice
2. The page computes its **SHA-256 hash entirely client-side** (the plaintext password is **never** sent to the server)
3. The hash is submitted via `POST /api/submit`
4. A live leaderboard auto-refreshes, showing all submitted hashes — and, once cracked, the recovered plaintext password

### Instructor Page (`/instructor.html`)

A dedicated control panel for the instructor. Features:
- View all submitted hashes with metadata (IP, country, submission time)
- Mark a hash as cracked and record the recovered password and number of attempts
- Delete individual entries or **clear the entire board** between sessions
- Manage the IP allowlist (restrict who can submit)
- Manage class spaces / groups

---

## 📡 API Reference

All endpoints return JSON. CORS headers are set to `*` for classroom convenience.

---

### `GET /api/myip`

Returns the caller's IP address and rich Cloudflare metadata. Useful for debugging allowlist issues.

**Response example:**
```json
{
  "ip": "1.2.3.4",
  "country": "DE",
  "city": "Munich",
  "region": "Bavaria",
  "asn": 1234,
  "asOrganization": "School ISP",
  "httpProtocol": "HTTP/2",
  "tlsVersion": "TLSv1.3",
  "tlsCipher": "AEAD-AES128-GCM-SHA256"
}
```

---

### `GET /api/hashes`

Returns all currently stored hash entries. Results are **cached in memory for 5 seconds** to reduce KV reads.

**Response example:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
    "spaceId": "room-a",
    "submitted": 1741300000000,
    "cracked": true,
    "password": "123456",
    "attempts": 1,
    "crackedAt": 1741300042000,
    "meta": {
      "ip": "1.2.3.4",
      "country": "DE",
      "city": "Munich"
    }
  }
]
```

---

### `POST /api/submit`

Submit a new SHA-256 hash. Requires passing the **allowlist check** and the **rate limit check**.

**Request body:**
```json
{
  "hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "spaceId": "classroom-1",
  "meta": { "nickname": "alice" }
}
```

**Validations:**
- `hash` must be a valid **64-character hex string** (SHA-256)
- `spaceId` must match a known space if any spaces are configured
- Caller IP must pass the allowlist (if rules exist)
- Maximum **25 hashes** stored concurrently
- **30-second cooldown** per IP address between submissions

**Success response:**
```json
{ "id": "550e8400-...", "success": true, "slotsLeft": 24 }
```

**Error responses:**

| HTTP | Meaning |
|---|---|
| `400` | Missing or invalid `hash` / `spaceId` |
| `403` | IP blocked by allowlist |
| `429` | Rate limit hit, or demo is full (25 submissions) |

---

### `POST /api/hash/:id`

Mark a specific hash entry as cracked.

**Request body:**
```json
{ "password": "hunter2", "attempts": 1337 }
```

The `password` value is HTML-escaped and truncated to 40 characters before storage.

---

### `DELETE /api/hash/:id`

Delete a specific hash entry by its UUID.

---

### `POST /api/clear`

Delete **all** hash entries and reset the index. Use this at the start of each new demo session.

**Response:**
```json
{ "cleared": 12 }
```

---

### `GET /api/allowlist`

Get the current raw allowlist rules as a string.

---

### `POST /api/allowlist`

Replace the allowlist rules entirely.

**Request body:**
```json
{ "rules": "country:DE\ncidr:10.0.0.0/8\n# school wifi\ncidr:192.168.1.0/24" }
```

---

### `GET /api/spaces`

List all configured spaces.

---

### `POST /api/spaces`

Create or update a space (upsert by `id`).

**Request body:**
```json
{
  "id": "room-a",
  "name": "Room A",
  "location": "Building 1, Floor 2",
  "description": "Monday morning session"
}
```

---

### `DELETE /api/spaces/:id`

Delete a space by its ID.

---

## 🛡 Access Control & Allowlist

To restrict submissions to known networks (e.g. the school Wi-Fi), configure allowlist rules. Rules are stored in the `PWDEMOAPPALLOWLIST` KV namespace under the key `rules`, one rule per line.

**Rule syntax:**

| Type | Format | Example | Description |
|---|---|---|---|
| `ip` | `ip:<address>` | `ip:192.168.1.10` | Allow a single IP |
| `cidr` | `cidr:<range>` | `cidr:10.0.0.0/8` | Allow an IP subnet |
| `country` | `country:<ISO code>` | `country:DE` | Allow by country code |
| `asn` | `asn:<number>` | `asn:13335` | Allow by ASN (e.g. school's ISP) |
| `ipv6` | `ipv6:allow` | `ipv6:allow` | Allow all IPv6 addresses |
| `#` | `# comment` | `# school network` | Comment line (ignored) |

If **no rules are defined**, all submissions are allowed.

Allowlist rules are **cached in memory for 60 seconds** to minimize KV read costs.

**Tip:** Use `GET /api/myip` on a student device to find the IP or ASN you need to allowlist.

---

## 🏫 Spaces (Group Management)

Spaces let you run the demo across **multiple classes or rooms simultaneously**, each with their own leaderboard view. Each space has:

| Field | Required | Description |
|---|---|---|
| `id` | ✅ | Unique identifier used in hash submissions (e.g. `room-a`) |
| `name` | ✅ | Human-readable display name (e.g. `Room A`) |
| `location` | ❌ | Optional physical location string |
| `description` | ❌ | Optional free-text description |

Spaces are stored in the `PWDEMOAPPALLOWLIST` KV namespace under the key `spaces` as a JSON array.

When at least one space is configured, every `POST /api/submit` request **must include a valid `spaceId`**, otherwise the submission is rejected with `400`.

---

## ⏱ Rate Limiting

Each IP address is limited to **one submission every 30 seconds**. Rate-limit state is stored as a KV entry with key `rl:<ip>` and a 60-second TTL. A second request within the window returns `HTTP 429`:

```json
{ "error": "Please wait 30 seconds between submissions." }
```

---

## 🗄 KV Storage

Two KV namespaces are used:

| Binding | Wrangler Name | Purpose |
|---|---|---|
| `PWDEMOAPPHASHES` | `PWDEMOAPPHASHES` | Hash entries, submission index (`__index__`), rate-limit keys (`rl:<ip>`) |
| `PWDEMOAPPALLOWLIST` | `PWDEMOAPPALLOWLIST` | Allowlist rules (`rules`), spaces config (`spaces`) |

**TTLs:**

| Data | TTL |
|---|---|
| Hash entries | 2 hours (7200 s) |
| Submission index (`__index__`) | 2 hours (7200 s) |
| Rate-limit keys (`rl:<ip>`) | 60 seconds |
| Allowlist / spaces | No expiry (persists until overwritten) |

**Index design:** To avoid expensive `KV.list()` API calls, all active hash entry UUIDs are stored as a single JSON array in the `__index__` key. Every `submit`, `delete`, and `clear` operation updates this index.

**In-memory cache:** The `/api/hashes` response is additionally cached in the Worker's memory for **5 seconds** to reduce KV reads under high polling frequency.

---

## 🚀 CI/CD Pipeline

Every push to the `main` branch automatically triggers a full deployment:

```
git push origin main
        │
        ▼
  GitHub Actions
  (.github/workflows/deploy.yml)
        │
        ▼
  actions/checkout@v4
        │
        ▼
  setup-node@v4  (Node.js 20)
        │
        ▼
  npm install
        │
        ▼
  cloudflare/wrangler-action@v3
        │
        ▼
  Cloudflare Workers — Live ✅
```

Deployment typically completes in under **60 seconds** from push.

---

## 💻 Local Development

**Prerequisites:** Node.js 20+, a Cloudflare account with access to the KV namespaces.

```bash
# Clone the repository
git clone https://github.com/zengelan/pw-hack-demo-app.git
cd pw-hack-demo-app

# Install dependencies (only wrangler as a dev dependency)
npm install

# Authenticate with Cloudflare
npx wrangler login

# Start the local dev server
npm run dev
# → Worker runs at http://localhost:8787
# → Static assets served from ./public
```

> **Note:** `wrangler dev` by default connects to your **remote** Cloudflare KV namespaces. Changes made during local development will affect the live KV data unless you use `--local` mode.

---

## 📦 Deployment

**Automatic (recommended):** Push any commit to the `main` branch — GitHub Actions deploys automatically.

**Manual:**
```bash
npm run deploy
# Equivalent to: npx wrangler deploy
```

The app is deployed to two endpoints:
- `https://pw-hack-demo-app.andreas-zengel.workers.dev/` — Workers.dev subdomain
- `https://pw-hack-demo.apps.zengel.cloud/` — Custom domain (zone: `zengel.cloud`)

---

## 🔑 Required GitHub Secrets

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with **Workers Scripts: Edit** and **Workers KV Storage: Edit** permissions |

Set this at: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

To create a suitable token: [Cloudflare Dashboard → My Profile → API Tokens → Create Token](https://dash.cloudflare.com/profile/api-tokens)

---

## ⚠️ Security Notice

This application **deliberately uses weak password hashing** for educational demonstration:

- **SHA-256 without a salt** is used so submitted hashes can be cracked with publicly available rainbow tables
- **Plaintext passwords are never sent to the server** — all hashing is performed client-side in the browser
- **Cracked passwords shown in the UI are HTML-escaped** and truncated to 40 characters to prevent XSS
- **The allowlist and rate limiter** exist solely to prevent abuse when the app is publicly accessible
- **Do NOT use any pattern from this codebase in a real authentication system**

For production password storage, always use a slow, salted hashing algorithm such as **bcrypt**, **scrypt**, or **Argon2**.

---

## 📄 License

[Apache 2.0](LICENSE)
