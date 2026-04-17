# Remote CLI Access — Design Document

## 1. Overview

Run the full TaskManager app (API server + web UI + SQLite + CLI) on a remote
VPS, and also install the CLI **locally** on a desktop machine so it can read
and mutate data on the remote server instead of `127.0.0.1`.

```
Desktop (local)                          VPS (remote)
┌──────────────────────┐                 ┌───────────────────────────────────┐
│  hirotm CLI          │─── HTTPS ─────► │  reverse proxy (Caddy / nginx)   │
│  profile: remote     │  Bearer token   │       ▼                          │
│  api_url: https://.. │  (cli-only key) │  Bun + Hono API  ◄── SQLite DB  │
│  api_key: tmk-...    │                 │       │                          │
└──────────────────────┘                 │  serves React SPA (installed)    │
                                         │       │                          │
   Cursor / AI agents                    │  Browser session (web principal) │
   use the same profile                  │  = passphrase login, cookie auth │
                                         │  = separate credential, full ctrl│
                                         │                                  │
                                         │  cli-api-keys.json (hashes only) │
                                         │  auth.json (web passphrase hash) │
                                         └───────────────────────────────────┘
```

**Key invariants:**

1. The CLI is still a thin HTTP client — the only change is *where* it
   points.
2. CLI API keys are a **separate credential** from the web passphrase /
   session cookie. They authenticate as `cli` principal only and cannot
   escalate to `web`.
3. The web user (or VPS operator) controls key lifecycle. The CLI cannot
   manage its own keys.

---

## 2. What Changes

### 2.1 New config field: `api_url`

Add `api_url` to the profile config schema.

**File:** `src/shared/runtimeConfig.ts`

```ts
export interface RuntimeConfigFile {
  api_key?: string;
  api_url?: string;          // ← NEW
  port?: number;
  data_dir?: string;
  auth_dir?: string;
  open_browser?: boolean;
}
```

**Resolution order** (highest priority first):

1. `TASKMANAGER_API_URL` env var
2. `api_url` in profile `config.json`
3. *(fall through to legacy localhost construction)*

When `api_url` is set, it is the full base URL used by the CLI.  
When absent, the CLI constructs `http://127.0.0.1:<port>` as it does today.

Add a resolver beside the existing ones:

```ts
export function resolveApiUrl(overrides: RuntimeConfigOverrides = {}): string | undefined {
  const config = readProfileConfig(overrides);
  const fromEnv = process.env.TASKMANAGER_API_URL?.trim();
  return fromEnv || config.api_url?.trim() || undefined;
}
```

### 2.2 CLI `buildBaseUrl` uses `api_url`

**File:** `src/cli/lib/api-client.ts`

Before:

```ts
function buildBaseUrl(overrides: ConfigOverrides = {}): string {
  return `http://127.0.0.1:${resolvePort(overrides)}`;
}
```

After:

```ts
function buildBaseUrl(overrides: ConfigOverrides = {}): string {
  const explicit = resolveApiUrl(overrides);
  if (explicit) return explicit.replace(/\/+$/, "");
  return `http://127.0.0.1:${resolvePort(overrides)}`;
}
```

That's the core of the entire feature. Every CLI command already flows through
`buildBaseUrl` → `apiRequest`, so every command automatically talks to the
remote server when a profile has `api_url`.

### 2.3 Re-export `resolveApiUrl` from CLI config

**File:** `src/cli/lib/config.ts`

```ts
export function resolveApiUrl(overrides: ConfigOverrides = {}): string | undefined {
  return resolveRuntimeApiUrl(overrides);
}
```

### 2.4 Guard `server start` / `server stop` for remote profiles

When the resolved `api_url` points somewhere other than localhost, spawning a
local child process makes no sense.

**File:** `src/cli/lib/process.ts` — `startServer` and `stopServer`

```ts
function isRemoteProfile(overrides: ConfigOverrides): boolean {
  const url = resolveApiUrl(overrides);
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
  } catch {
    return false;
  }
}
```

In `startServer`:

```ts
if (isRemoteProfile(overrides)) {
  throw new CliError(
    "Cannot start a local server for a remote profile — manage the server on the remote host",
    2,
    { code: CLI_ERR.invalidArgs, api_url: resolveApiUrl(overrides) },
  );
}
```

Same guard in `stopServer`.

`readServerStatus` should still work — it calls `/api/health` via
`fetchHealth`, which already goes through `buildBaseUrl`.

### 2.5 Fix the exit-6 "start hint" for remote profiles

**File:** `src/cli/lib/api-client.ts` — the `catch` in `apiRequest`

Today the hint says `Run: hirotm server start ...`. When the profile is
remote, the hint should say something like:

```
Server not reachable at https://tasks.example.com — verify the remote
server is running and the URL is correct.
```

```ts
function buildUnreachableHint(overrides: ConfigOverrides): string {
  if (isRemoteProfile(overrides)) {
    return `Verify the remote server is running and the URL is correct`;
  }
  return `Run: ${buildStartCommand(overrides)}`;
}
```

### 2.6 CLI API Key Authentication

#### Security boundary

The existing auth design defines two principals:

- **`web`** — authenticated via session cookie (passphrase login); full access
- **`cli`** — no session cookie; limited by CLI policy

The CLI API key is a **separate, dedicated credential** for the `cli`
principal. It has nothing in common with the web passphrase, session cookie,
or recovery key. A valid CLI API key authenticates the caller as `cli` — it
can never escalate to `web`. The web user controls CLI policy; the CLI key
only grants the ability to act *within* that policy.

This separation is intentional: the CLI is a lower-trust principal, and
sharing any credential with the web session would let CLI callers bypass the
policy boundary.

#### Key lifecycle

**Generation** — server-side CLI command, run on the VPS by the operator:

```bash
# On the VPS:
hirotm server api-key generate
```

This command:

1. Generates a cryptographically random 32-byte key (`randomBytes(32)`)
2. Formats it as a prefixed hex string: `tmk-<64 hex chars>`
3. Hashes the key with SHA-256
4. Stores **only the hash** in `cli-api-keys.json` inside the auth directory
5. Prints the raw key **once** to stdout — the operator copies it

The raw key is never stored on the server. This mirrors the recovery key
pattern already used in `auth.ts`.

**Distribution** — manual copy by the operator:

The operator copies the printed key and places it in the desktop CLI profile:

```bash
# On the desktop:
hirotm config set api_key "tmk-a3f8c1..."  --profile remote
# or edit ~/.taskmanager/profiles/remote/config.json directly
```

**Revocation** — server-side, or from the web UI:

```bash
# On the VPS (revoke by key prefix):
hirotm server api-key revoke tmk-a3f8c1
```

Or from the web UI: Settings → CLI API Keys → Revoke. The web user has full
control over which keys exist; the CLI cannot manage its own keys.

**Rotation** — generate a new key, distribute it, then revoke the old one.

#### Storage on the server

**File:** `<auth_dir>/cli-api-keys.json`

Separate from `auth.json` because CLI keys are a distinct concern from web
auth state. Same directory, same file permissions (`0o600`).

```json
{
  "version": 1,
  "keys": [
    {
      "id": "tmk-a3f8",
      "hash": "<sha256 hex of full key>",
      "label": "Desktop / Cursor",
      "createdAt": "2026-04-12T10:00:00.000Z"
    }
  ]
}
```

Fields:

- `id` — short prefix of the key for display / revocation (first 8 chars)
- `hash` — SHA-256 hex digest; used for constant-time comparison
- `label` — optional human-readable name (set at generation time)
- `createdAt` — for audit / display

This supports multiple keys from day one (e.g. desktop + CI + second
machine), though a single key is the expected starting point.

#### Storage on the client

The raw key lives in the profile `config.json` as the existing `api_key`
field. No new field needed on the client side.

```json
{
  "api_url": "https://tasks.example.com",
  "api_key": "tmk-a3f8c1...full 64 hex chars"
}
```

The CLI already reads `api_key` from config and sends it as
`Authorization: Bearer <key>`. No change to the client sending logic.

#### Server-side validation

**File:** `src/server/auth.ts` — `authMiddleware`

When a request has no valid session cookie (would be `cli` principal), check
for a Bearer token:

```ts
// After determining the caller has no valid session cookie:
const bearerRaw = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();

if (hasCliApiKeys()) {
  // Server has CLI keys configured → enforce authentication
  if (!bearerRaw) {
    return c.json({ error: "CLI API key required", code: "auth_cli_key_required" }, 401);
  }
  if (!validateCliApiKey(bearerRaw)) {
    return c.json({ error: "Invalid CLI API key", code: "auth_invalid_cli_key" }, 401);
  }
  // Valid CLI key → proceed as principal "cli" (policy still applies)
}
// No CLI keys configured → localhost-only legacy behavior (no key needed)
```

**`validateCliApiKey`** hashes the incoming token with SHA-256 and does a
constant-time comparison against every stored key hash (small list; linear
scan is fine).

**Enforcement rule:** CLI API key validation is **only enforced when at least
one key exists** in `cli-api-keys.json`. This preserves the current localhost
development experience — no key needed when running locally without
generating any keys.

#### What the CLI key can NOT do

- Authenticate as `web` principal
- Change CLI access policy (web-only routes)
- Access `/api/auth/*` setup/login/logout routes (session-cookie-only)
- Bypass board-scoped CLI policy restrictions
- Generate, list, or revoke other CLI API keys via the API

The CLI key is strictly an **identity gate** — "is this caller allowed to act
as the `cli` principal at all?" What the `cli` principal can then do is
governed entirely by the existing policy system controlled by the web user.

#### Why not public/private key cryptography

Considered and rejected for initial implementation:

- **Transport is already encrypted** — HTTPS handles confidentiality and
  integrity. The Bearer token only needs to prove the caller knows the secret.
- **Complexity** — key pair generation, signing, verification, and key format
  management are significantly more code for no practical security gain when
  the transport is TLS.
- **Precedent** — the existing auth system (passphrase hash, recovery key
  hash, session token hash) is all symmetric/hash-based. CLI keys should
  follow the same pattern.

Public/private keys would matter if the server needed to verify requests
without being able to impersonate the client (e.g., multi-party trust). That
is not the threat model here.

#### New CLI commands

**Server-side (run on VPS):**

| Command | Synopsis |
|---------|----------|
| `server api-key generate` | `hirotm server api-key generate [--label <text>]` |
| `server api-key list` | `hirotm server api-key list` |
| `server api-key revoke` | `hirotm server api-key revoke <key-prefix>` |

`api-key generate` prints the raw key to stdout. In `--format ndjson` it
outputs `{ "key": "tmk-...", "id": "tmk-a3f8", "label": "..." }`.

`api-key list` shows key IDs, labels, and creation dates. Never shows the
full key or hash.

`api-key revoke` matches by the short ID prefix and removes the entry.

**Client-side (convenience, not required):**

| Command | Synopsis |
|---------|----------|
| `config set` | `hirotm config set <field> <value> [--profile <name>]` |

Could be added later. For now, editing `config.json` directly or using env
vars is sufficient.

**Web UI (future, not required for initial implementation):**

Settings → CLI API Keys page showing active keys with revoke buttons. This
lets the web user manage CLI access without SSH-ing into the VPS.

### 2.7 Profile config examples

**On the VPS** (`~/.taskmanager/profiles/default/config.json`):

```json
{
  "port": 3001
}
```

CLI API keys are **not** stored in `config.json` on the server — they live
in `<auth_dir>/cli-api-keys.json` and are managed through `hirotm server
api-key` commands. The server does not need `api_key` in its own profile
config.

The server starts normally: `hirotm server start --background`

**On the desktop** (`~/.taskmanager/profiles/remote/config.json`):

```json
{
  "api_url": "https://tasks.example.com",
  "api_key": "tmk-a3f8c1...paste full key here"
}
```

Usage:

```bash
hirotm --profile remote boards list
hirotm --profile remote tasks add --board sprint --list 3 --group 1 --title "New task" --client-name "Cursor Agent"

# Or use a shell alias / wrapper that always adds `--profile remote`.
```

---

## 3. What Stays the Same

| Area | Why |
|------|-----|
| Web UI | Served from the same origin on the VPS; no code changes. |
| SSE / EventSource | Browser connects to its own origin; CLI doesn't use SSE. |
| SQLite | Lives on the VPS; only the server process touches it. |
| Principal model | `principal: "web"` (session cookie) vs `principal: "cli"` (API key) unchanged. CLI key adds a gate at the door; CLI policy is still the room-by-room access control. |
| CLI command surface | Every command works identically; only the transport target changes. |
| `--format`, `--fields`, `--quiet` | Output is the same regardless of local vs remote. |

---

## 4. VPS Deployment

### 4.1 Prerequisites

- Bun installed on the VPS
- `hirotm` installed globally (`bun install -g hirotm`) or built from repo
- A domain pointed at the VPS (for HTTPS)
- A reverse proxy (Caddy recommended)

### 4.2 Caddy reverse proxy (recommended)

Caddy auto-provisions TLS certificates via Let's Encrypt.

`/etc/caddy/Caddyfile`:

```
tasks.example.com {
    reverse_proxy localhost:3001
}
```

That's it. Caddy handles HTTPS termination, cert renewal, and proxying to
the Bun server on port 3001.

### 4.3 Start the server

```bash
# On the VPS:
hirotm server start --background
```

Or with a systemd unit for auto-restart:

```ini
[Unit]
Description=TaskManager
After=network.target

[Service]
Type=simple
User=taskmanager
ExecStart=/home/taskmanager/.bun/bin/hirotm server start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 4.4 Auth setup

**Web auth** (browser access):

On first visit to `https://tasks.example.com`, the web UI shows the
passphrase setup screen (existing flow). This creates `auth.json` in the
VPS profile's auth directory. The web passphrase + session cookie is the
only way to get `web` principal access.

**CLI auth** (remote CLI access):

After the server is running, generate a CLI API key on the VPS:

```bash
hirotm server api-key generate --label "Desktop"
```

Copy the printed key to the desktop profile. The key authenticates as `cli`
principal — it cannot access web-only routes or change CLI policy.

These are two completely independent credentials with different privilege
levels. The web passphrase is never shared with CLI callers.

---

## 5. Security Considerations

| Concern | Mitigation |
|---------|------------|
| CLI key in transit | HTTPS via reverse proxy; never send over plain HTTP. |
| CLI key storage (server) | Only the SHA-256 hash is stored in `cli-api-keys.json` (0o600 permissions). Raw key is never persisted server-side. |
| CLI key storage (client) | Profile `config.json` in `~/.taskmanager/profiles/`; same security model as SSH keys in `~/.ssh/`. |
| CLI key → web escalation | Impossible by design. CLI key authenticates as `cli` principal only. Web auth uses a completely separate session cookie from passphrase login. No credential is shared. |
| CLI key self-management | CLI key holders cannot generate, list, or revoke keys via the API. Key management is server-side CLI only (operator with shell access) or web UI only (authenticated web user). |
| Brute-force CLI key | 32-byte random key = 256 bits of entropy. Rate limiting can be added at the reverse proxy layer. |
| Open port exposure | For VPS behind a reverse proxy, bind Bun to `127.0.0.1` via config or firewall so only the proxy can reach it. |
| Cookie security | `secure: true` is already set when `protocol === "https:"` in `setAuthSessionCookie`. |
| CORS | No CORS middleware in `installed` mode — SPA and API share the same origin through the reverse proxy. |
| Localhost backward compatibility | CLI key validation is only enforced when keys exist in `cli-api-keys.json`. Pure localhost setups with no generated keys continue working without authentication, preserving the current dev experience. |

---

## 6. Implementation Checklist

Ordered by dependency. Each item is a small, self-contained change.

**Remote URL support (CLI side):**

- [ ] Add `api_url` to `RuntimeConfigFile` in `src/shared/runtimeConfig.ts`
- [ ] Add `resolveApiUrl` resolver in `src/shared/runtimeConfig.ts`
- [ ] Re-export from CLI config in `src/cli/lib/config.ts`
- [ ] Update `buildBaseUrl` in `src/cli/lib/api-client.ts` to prefer `api_url`
- [ ] Add `isRemoteProfile` helper in `src/cli/lib/process.ts`
- [ ] Guard `startServer` / `stopServer` against remote profiles
- [ ] Update unreachable hint in `api-client.ts` for remote profiles

**CLI API key system (server side):**

- [ ] Create `cli-api-keys.json` read/write helpers in `src/server/cliApiKeys.ts` (hash storage, constant-time validation, same auth dir as `auth.json`)
- [ ] Add `hirotm server api-key generate` command (generates key, stores hash, prints raw key once)
- [ ] Add `hirotm server api-key list` command (shows IDs, labels, dates — never the key or hash)
- [ ] Add `hirotm server api-key revoke` command (removes entry by prefix)
- [ ] Add CLI API key validation in `authMiddleware` in `src/server/auth.ts` (enforce only when keys exist)

**Infrastructure / docs:**

- [ ] Bind address config — allow restricting server to `127.0.0.1` for VPS-behind-proxy setups (optional, can use firewall instead)
- [ ] Update `AGENTS.md` — add `--profile remote` guidance and remote profile setup
- [ ] Update `README.md` — add remote deployment section

**Future (not required for initial remote access):**

- [ ] Web UI: Settings → CLI API Keys page (list / revoke from browser)
- [ ] `hirotm config set` convenience command for client-side profile editing

---

## 7. Quick-Start (After Implementation)

```bash
# ══════════════════════════════════════════
# On the VPS
# ══════════════════════════════════════════

bun install -g hirotm
hirotm server start --background

# Set up web auth (visit https://tasks.example.com in browser, set passphrase)

# Generate a CLI API key — prints the raw key ONCE
hirotm server api-key generate --label "Desktop / Cursor"
# Output: { "key": "tmk-a3f8c1...64 hex chars", "id": "tmk-a3f8", "label": "Desktop / Cursor" }
# ^^^ Copy the full "key" value. It will not be shown again.

# ══════════════════════════════════════════
# On the desktop
# ══════════════════════════════════════════

bun install -g hirotm

mkdir -p ~/.taskmanager/profiles/remote
cat > ~/.taskmanager/profiles/remote/config.json << 'EOF'
{
  "api_url": "https://tasks.example.com",
  "api_key": "tmk-a3f8c1...paste full key here"
}
EOF

# Test it
hirotm --profile remote server status
hirotm --profile remote boards list

# For ongoing use, pass `--profile remote` on each command (or use a shell alias).
```

---

## 8. Alternatives Considered

### SSH tunnel (zero code changes)

```bash
ssh -L 3001:localhost:3001 your-vps
# Then hirotm works as-is against 127.0.0.1:3001
```

Pro: no code changes at all.  
Con: requires an active SSH session; not practical for always-on AI agent use
in Cursor; tunnel management is manual.

### Tailscale / WireGuard

Assigns a private IP to the VPS. CLI config would use that IP + port directly
over the encrypted mesh, no reverse proxy needed.

Pro: simpler infra than Caddy + domain.  
Con: still need the `api_url` config change in the CLI so it doesn't hardcode
`127.0.0.1`; also needs API key enforcement for security.

Both alternatives still benefit from the `api_url` config change — it makes
the CLI flexible regardless of the network layer chosen.
