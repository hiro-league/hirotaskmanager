# Remote CLI Access — Design Document

**Phased implementation:** [remote-cli-access-implementation-plan.md](./remote-cli-access-implementation-plan.md) — ordered phases with dependencies, exit criteria, and PR boundaries.

## Note (current product behavior)

All settings live in the active profile’s **`config.json`**. The active profile is the one named by **`--profile <name>`** if provided, otherwise the **default profile** (a pointer stored in **`~/.taskmanager/config.json`**). Day-to-day commands need no extra arguments — agents and humans just type `hirotm boards list`.

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

1. The CLI is still a thin HTTP client — its only target is the active profile’s `api_url` (no fallback construction).
2. Profiles have an internal **`role`** discriminator (`server` or `client`), but the user never picks a role directly. Two setup commands handle every scenario:
   - **`hirotaskmanager --setup-server`** — this machine **runs** the server (and is implicitly its own local client too). Works for VPS installs and same-machine all-in-one installs.
   - **`hirotaskmanager --setup-client`** — this machine **only talks to a remote server**.
3. A **default profile pointer** (`~/.taskmanager/config.json` → `{ "default_profile": "<name>" }`) lets every command run without `--profile`. AI agents and casual usage need no extra arguments.
4. CLI API keys are a **separate credential** from the web passphrase / session cookie. They authenticate as `cli` principal only and cannot escalate to `web`.
5. The web user (or VPS operator) controls key lifecycle. The CLI cannot manage its own keys via the API.
6. Key enforcement is driven by **server exposure**: loopback-bound servers default to no key required; non-loopback bind addresses force `require_cli_api_key: true`. Operators can opt into key enforcement on loopback too.
7. Server-admin / install commands use **`hirotaskmanager`** (`--setup-server`, `--setup-client`, `server start/stop`, `server api-key …`, `profile use`). Day-to-day data ops use **`hirotm`**. Both binaries dispatch into the same code; the split is a UX/docs convention.

---

## 2. What Changes

### 2.1 Profile roles, default profile, and config schema

#### Two profile shapes (one internal `role` discriminator)

A profile is either:

- **server profile** (`role: "server"`) — this machine runs the API server. It is **also the local client for that server** automatically: every CLI command run with this profile talks to `http://127.0.0.1:<port>`. There is no need for a second "client" profile on the same machine.
- **client profile** (`role: "client"`) — this machine only talks to a remote server. It contains `api_url` and `api_key`; it never runs anything locally.

The user never picks `role` by hand — it’s set by the setup mode (`--setup-server` writes `"server"`, `--setup-client` writes `"client"`).

#### Default profile pointer

A new top-level config file `~/.taskmanager/config.json`:

```json
{ "default_profile": "main" }
```

- `--profile <name>` always wins.
- Otherwise the resolver reads `default_profile` from this file.
- If neither is set and exactly one profile exists on disk, that profile is used implicitly (and the wizard offers to write the pointer).
- If neither is set and multiple profiles exist, the CLI errors with `CliError(invalidConfig)` listing the available names and asking the user to run `hirotaskmanager profile use <name>` (or pass `--profile`).

This pointer is what lets agents and casual users keep typing `hirotm boards list` with no extra arguments.

#### Profile config schema

**File:** `src/shared/runtimeConfig.ts`

```ts
export type ProfileRole = "server" | "client";

export interface RuntimeConfigFile {
  role: ProfileRole;             // required

  // server-role fields (forbidden on client profiles)
  port?: number;                 // required when role === "server"
  data_dir?: string;             // required when role === "server"
  auth_dir?: string;             // required when role === "server"
  open_browser?: boolean;        // optional, server-only
  bind_address?: string;         // optional, server-only — defaults to "127.0.0.1"
  require_cli_api_key?: boolean; // optional, server-only — see §2.6
  api_key?: string;              // optional, server-only — used by the LOCAL client
                                 //   when require_cli_api_key is true (see §2.6)

  // client-role fields (forbidden on server profiles)
  api_url?: string;              // required when role === "client" — absolute URL
  // (client profiles also use `api_key`, declared above; required for client profiles)
}

export interface TopLevelConfigFile {
  default_profile?: string;      // name of the profile used when --profile is omitted
}
```

#### Field matrix

| Field | Server profile | Client profile |
|---|---|---|
| `role` | `"server"` | `"client"` |
| `port` | required | — |
| `data_dir` | required | — |
| `auth_dir` | required | — |
| `open_browser` | optional | — |
| `bind_address` | optional (default `127.0.0.1`) | — |
| `require_cli_api_key` | optional (default derived from `bind_address`) | — |
| `api_url` | — (auto-derived as `http://127.0.0.1:<port>` for the local client) | required (absolute URL) |
| `api_key` | optional (used by the local client when `require_cli_api_key: true`) | required |

#### Validation rules (enforced in `runtimeConfig.ts` on load)

1. `role` is required and must be `"server"` or `"client"`.
2. If `role === "server"`: `port`, `data_dir`, `auth_dir` are required; `api_url` MUST NOT be present (it is auto-derived from `port`).
3. If `role === "client"`: `api_url` is required and must be a valid absolute URL; `api_key` is required; `port`, `data_dir`, `auth_dir`, `open_browser`, `bind_address`, `require_cli_api_key` MUST NOT be present.
4. If `role === "server"` AND `bind_address` is non-loopback (anything other than `127.0.0.1` / `localhost` / `::1`): `require_cli_api_key: false` is rejected. Public exposure without a key is never allowed.
5. If `role === "server"` AND `require_cli_api_key === true` AND no `api_key` is set: the local client will be unable to call the server. Validation emits a **warning** (not an error) telling the operator to either set `api_key` in this profile or pass `--api-key` per command. (Not an error because external clients may still use `cli-api-keys.json`.)
6. Validation failures throw a `CliError` with code `CLI_ERR.invalidConfig` listing the offending fields and the path of the profile’s `config.json`.

#### Resolvers

All read from the active profile’s `config.json`. Calls that don’t make sense for a given role throw `CliError(invalidConfig)`.

```ts
export function resolveProfileRole(overrides: RuntimeConfigOverrides = {}): ProfileRole;
export function resolveApiKey(overrides: RuntimeConfigOverrides = {}): string | undefined;
export function resolveBindAddress(overrides: RuntimeConfigOverrides = {}): string;        // role must be "server"
export function resolveRequireCliApiKey(overrides: RuntimeConfigOverrides = {}): boolean;  // role must be "server"

// Auto-derives for server profiles, reads from config for client profiles.
// Always returns an absolute URL; never throws on a valid profile of any role.
export function resolveApiUrl(overrides: RuntimeConfigOverrides = {}): string;

// Default-profile pointer (top-level ~/.taskmanager/config.json):
export function resolveDefaultProfileName(): string | undefined;
export function writeDefaultProfileName(name: string): void;
```

`resolveApiUrl` derivation:

```ts
const role = resolveProfileRole(overrides);
if (role === "client") return readProfileConfig(overrides).api_url!;     // required, validated
// role === "server": local client target derived from the server's own port.
const { port } = readProfileConfig(overrides);
return `http://127.0.0.1:${port}`;
```

`resolveRequireCliApiKey` default logic (server-side; see §2.6):

```ts
if (config.require_cli_api_key !== undefined) return config.require_cli_api_key;
const bind = resolveBindAddress(overrides);
return bind !== "127.0.0.1" && bind !== "localhost" && bind !== "::1";
```

`resolveApiKey` is consulted by the CLI on **every** outgoing request (server and client profiles alike). If present, it is sent as `Authorization: Bearer <key>`. If absent and the server requires one, the CLI gets a clear `auth_cli_key_required` error with a hint (see §2.5).

### 2.2 CLI `buildBaseUrl` always uses `resolveApiUrl`

**File:** `src/cli/lib/api-client.ts`

`resolveApiUrl` returns the right URL for *both* roles — auto-derived loopback URL for server profiles, configured `api_url` for client profiles. No fallback branches in the CLI.

```ts
function buildBaseUrl(overrides: ConfigOverrides = {}): string {
  return resolveApiUrl(overrides).replace(/\/+$/, "");
}
```

That’s the core of the entire feature. Every CLI command already flows through `buildBaseUrl` → `apiRequest`, so every command automatically targets the right server — local (server profile) or remote (client profile) — without the command code knowing or caring about role.

### 2.3 Re-export resolvers from CLI config

**File:** `src/cli/lib/config.ts`

```ts
export {
  resolveProfileRole,
  resolveApiUrl,
  resolveApiKey,
  resolveBindAddress,
  resolveRequireCliApiKey,
  resolveDefaultProfileName,
  writeDefaultProfileName,
} from "../../shared/runtimeConfig";
```

### 2.4 Guard `server start` / `server stop` for client profiles

A CLI invocation that wants to spawn or stop a local child process (`server start`, `server stop`) only makes sense for a **server profile** — a client profile points at a remote (or someone else’s local) server it has no business managing.

**File:** `src/cli/lib/process.ts`

```ts
function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}
```

In `startServer` / `stopServer`:

```ts
const role = resolveProfileRole(overrides);
if (role !== "server") {
  throw new CliError(
    "This profile is a client profile — server start/stop only works on a server profile",
    2,
    { code: CLI_ERR.invalidArgs, role, api_url: resolveApiUrl(overrides) },
  );
}
```

`readServerStatus` works against any profile — it calls `/api/health` via `fetchHealth`, which goes through `buildBaseUrl`. For client profiles it reports remote reachability; for server profiles it reports local server health.

### 2.5 Exit-6 "unreachable" hint per profile role

**File:** `src/cli/lib/api-client.ts` — the `catch` in `apiRequest`

The hint depends on the active profile’s role and URL:

```ts
function buildUnreachableHint(overrides: ConfigOverrides): string {
  const url = resolveApiUrl(overrides);
  const role = resolveProfileRole(overrides);
  if (role === "server") {
    return `Server not reachable at ${url} — start it with: hirotaskmanager server start`;
  }
  // role === "client"
  if (isLoopbackUrl(url)) {
    return `Server not reachable at ${url} — make sure the local server is running (this client profile points at loopback, but does not manage it)`;
  }
  return `Server not reachable at ${url} — verify the remote server is running and the URL is correct`;
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

**Generation** — server-side command, run by the operator on the machine that hosts the auth directory:

```bash
# On the server machine:
hirotaskmanager server api-key generate [--label "<text>"]
```

This command:

1. Generates a cryptographically random 32-byte key (`randomBytes(32)`).
2. Formats it as a prefixed hex string: `tmk-<64 hex chars>`.
3. Hashes the key with SHA-256.
4. Stores **only the hash** in `cli-api-keys.json` inside the auth directory.
5. Prints the raw key **once** to stdout — the operator copies it.

The raw key is never stored on the server. This mirrors the recovery key pattern already used in `auth.ts`.

**Important:** `api-key generate` is a direct file-system operation against `<auth_dir>/cli-api-keys.json`. It does **not** require the server to be running. This lets the setup wizard mint the first key inline as part of `--setup-server` (see §2.8) — no need for a separate "start server, then mint key" step.

**Distribution** — depends on which side needs the key:

- **Same machine (server profile, `require_cli_api_key: true`):** the wizard offers to copy the freshly minted key into the same profile’s `api_key` field automatically. The local CLI works immediately.
- **Remote machine (client profile):** the operator copies the printed key from the server and pastes it during `hirotaskmanager --setup-client` on the client machine, or edits the client profile’s `config.json` directly:

```bash
# On the client machine:
hirotaskmanager --setup-client --profile remote   # paste the key when prompted
# or edit ~/.taskmanager/profiles/remote/config.json directly
```

**Revocation** — server-side, or from the web UI:

```bash
# On the server machine (revoke by key prefix):
hirotaskmanager server api-key revoke tmk-a3f8c1
```

Or from the web UI: Settings → CLI API Keys → Revoke. The web user has full control over which keys exist; the CLI cannot manage its own keys via the API.

**Rotation** — generate a new key, distribute it, then revoke the old one.

#### Storage on the server

**File:** `<auth_dir>/cli-api-keys.json`

Separate from `auth.json` for maintainability, not as a security boundary (both files live in the same `auth_dir` with `0o600` permissions). Reasons:

- **Different lifecycles.** `auth.json` is set up once (passphrase + recovery key). CLI keys are added/revoked over time, often several at once (desktop, CI, second machine). One file per concern reduces concurrent-write risk and the blast radius if the file gets corrupted.
- **Different shape.** `auth.json` holds a single principal’s credentials and session state; `cli-api-keys.json` is an array of independent credentials with metadata (`id`, `label`, `createdAt`).
- **Different access patterns.** Web auth is read on login / cookie verify; CLI keys are read on every CLI request — independent caching/optimization.
- **Operator clarity.** Rotating or revoking CLI keys never touches the file containing the web passphrase hash.
- **Future portability.** If CLI keys later move to DB-backed storage (so the web UI can manage them at scale), it’s a clean swap of one file/module.

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

The raw key lives in the profile `config.json` as `api_key`. This is true for **both** profile shapes:

- **Server profile** (same-machine client, when `require_cli_api_key: true`):
    ```json
    {
      "role": "server",
      "port": 3001,
      "data_dir": "...",
      "auth_dir": "...",
      "bind_address": "127.0.0.1",
      "require_cli_api_key": true,
      "api_key": "tmk-a3f8c1...full 64 hex chars"
    }
    ```
- **Client profile** (remote):
    ```json
    {
      "role": "client",
      "api_url": "https://tasks.example.com",
      "api_key": "tmk-a3f8c1...full 64 hex chars"
    }
    ```

The CLI reads `api_key` from the active profile’s config and sends it as `Authorization: Bearer <key>` on every request. The server-side validation (next subsection) decides whether it is required.

#### Server-side validation

**File:** `src/server/auth.ts` — `authMiddleware`

When a request has no valid session cookie (would be `cli` principal), check for a Bearer token:

```ts
// After determining the caller has no valid session cookie:
const bearerRaw = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();

if (resolveRequireCliApiKey()) {
  if (!bearerRaw) {
    return c.json({ error: "CLI API key required", code: "auth_cli_key_required" }, 401);
  }
  if (!validateCliApiKey(bearerRaw)) {
    return c.json({ error: "Invalid CLI API key", code: "auth_invalid_cli_key" }, 401);
  }
  // Valid CLI key → proceed as principal "cli" (policy still applies)
} else if (bearerRaw) {
  // Optional: if a key was sent and any keys exist, still validate so callers
  // get a clear error on a stale/wrong key rather than silent acceptance.
  if (hasCliApiKeys() && !validateCliApiKey(bearerRaw)) {
    return c.json({ error: "Invalid CLI API key", code: "auth_invalid_cli_key" }, 401);
  }
}
// Otherwise → loopback-only mode without enforcement; proceed as principal "cli".
```

**`validateCliApiKey`** hashes the incoming token with SHA-256 and does a constant-time comparison against every stored key hash (small list; linear scan is fine).

**Enforcement rule:** CLI API key validation is required when `resolveRequireCliApiKey()` returns `true`. The default derivation is:

| `bind_address` (server profile) | `require_cli_api_key` default |
|---|---|
| `127.0.0.1` / `localhost` / `::1` | `false` (no key needed) |
| anything else (e.g. `0.0.0.0`, public IP) | `true` (key required) |

This ties auth to **exposure**: a server reachable only from this machine doesn’t need a CLI key; a server reachable from the network does.

**Operator override — `require_cli_api_key`:**

The server profile may set `require_cli_api_key: true` to **force** key enforcement even on a loopback-bound server. Use cases:

- Same-machine setup where the operator wants the local client to authenticate exactly as a remote client would (e.g. mirroring production locally, or hardening a multi-user workstation).
- Defense-in-depth on a shared machine where another local user should not be able to reach the API without a key.

`require_cli_api_key: false` on a non-loopback bind is rejected by config validation — exposing the API publicly without a key is never allowed.

**Bootstrap caveat:** when `require_cli_api_key` is `true` but no keys exist yet, all CLI requests fail with `auth_cli_key_required`. The operator must run `hirotaskmanager server api-key generate` (a server-side, file-system-only command — no HTTP) to mint the first key. The setup wizard does this inline whenever the chosen options imply it’s needed (see §2.8).

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

All `server api-key` commands are direct file-system operations against `<auth_dir>/cli-api-keys.json`. They run via the **`hirotaskmanager`** binary (consistent with `--setup-server`, `server start/stop`, and other server-admin commands), do not require the HTTP server to be running, and only work when invoked on a profile with `role === "server"`.

**Server-side (run on the server machine):**

| Command | Synopsis |
|---------|----------|
| `server api-key generate` | `hirotaskmanager server api-key generate [--label <text>] [--save-to-profile]` |
| `server api-key list` | `hirotaskmanager server api-key list` |
| `server api-key revoke` | `hirotaskmanager server api-key revoke <key-prefix>` |

- `api-key generate` prints the raw key to stdout. In `--format ndjson`: `{ "key": "tmk-...", "id": "tmk-a3f8", "label": "..." }`. With `--save-to-profile`, it additionally writes the freshly minted key to the **active server profile’s** `api_key` field (so the local CLI authenticates immediately when `require_cli_api_key: true`). Refuses with `CliError(invalidArgs)` if the active profile’s `role !== "server"`.
- `api-key list` shows key IDs, labels, and creation dates. Never shows the full key or hash.
- `api-key revoke <id-prefix>` removes the matching entry.

**Client-side (convenience, not required):**

| Command | Synopsis |
|---------|----------|
| `config set` | `hirotm config set <field> <value> [--profile <name>]` |

Could be added later. For now, editing the profile’s `config.json` directly
is sufficient.

**Web UI (future, not required for initial implementation):**

Settings → CLI API Keys page showing active keys with revoke buttons. This
lets the web user manage CLI access without SSH-ing into the VPS.

### 2.7 Profile config examples

**Server profile** on the VPS (`~/.taskmanager/profiles/default/config.json`):

```json
{
  "role": "server",
  "port": 3001,
  "data_dir": "/var/lib/taskmanager/data",
  "auth_dir": "/var/lib/taskmanager/auth",
  "open_browser": false,
  "bind_address": "127.0.0.1"
}
```

(In this layout, Caddy is the only thing that talks to Bun, so `bind_address: "127.0.0.1"` is safe. Public callers reach Bun via Caddy; whether they need a key is governed by `require_cli_api_key` on the server profile, which the operator sets explicitly when exposing the API publicly.)

**Server profile** exposing Bun directly to the network (no reverse proxy):

```json
{
  "role": "server",
  "port": 3001,
  "data_dir": "/var/lib/taskmanager/data",
  "auth_dir": "/var/lib/taskmanager/auth",
  "open_browser": false,
  "bind_address": "0.0.0.0",
  "require_cli_api_key": true,
  "api_key": "tmk-a3f8c1...optional, lets the LOCAL CLI authenticate"
}
```

(`require_cli_api_key: true` is forced by validation because `bind_address` is non-loopback. The optional `api_key` here is the *local* client’s copy — same field meaning as on a client profile — so commands run on this same machine authenticate without prompting. Distinct from `<auth_dir>/cli-api-keys.json`, which holds hashes of all minted keys.)

**Server profile** on a single-host setup that wants forced key auth even locally:

```json
{
  "role": "server",
  "port": 3001,
  "data_dir": "/var/lib/taskmanager/data",
  "auth_dir": "/var/lib/taskmanager/auth",
  "bind_address": "127.0.0.1",
  "require_cli_api_key": true,
  "api_key": "tmk-a3f8c1...local CLI’s copy"
}
```

The minted key’s **hash** lives in `<auth_dir>/cli-api-keys.json` (managed via `hirotaskmanager server api-key` commands); the **raw** key may live in this profile’s `api_key` field for the local CLI’s convenience. Both are written by `hirotaskmanager server api-key generate --save-to-profile`.

The server starts normally: `hirotaskmanager server start --background`.

**Client profile** (`~/.taskmanager/profiles/work/config.json`):

```json
{
  "role": "client",
  "api_url": "https://tasks.example.com",
  "api_key": "tmk-a3f8c1...paste full key here"
}
```

**Default profile pointer** (`~/.taskmanager/config.json`):

```json
{ "default_profile": "work" }
```

Usage with the default profile (no `--profile` needed):

```bash
hirotm boards list
hirotm tasks add --board sprint --list 3 --group 1 --title "New task" --client-name "Cursor Agent"
```

Switching profiles for a single command:

```bash
hirotm --profile staging boards list
```

Switching the default profile:

```bash
hirotaskmanager profile use staging
```

### 2.8 First-run setup — two modes

The setup wizard offers **two modes**, one per scenario:

- **`hirotaskmanager --setup-server`** — this machine runs the server. The same profile is also the local client for that server (no second profile needed). Works for VPS deployments and same-machine all-in-one installs.
- **`hirotaskmanager --setup-client`** — this machine has only the CLI and connects to a remote server.

Plain `hirotaskmanager` with no flags runs the wizard interactively: it first asks one question to pick the mode, then runs the corresponding flow.

`hirotaskmanager --setup` re-runs the wizard for the **active profile** (preserving its role), pre-filling all current values as defaults.

#### Top-level flags

| Flag | Effect |
|---|---|
| `--setup-server` | Run the server-mode flow. |
| `--setup-client` | Run the client-mode flow. |
| `--setup` | Re-run setup for the existing active/specified profile (role is immutable). |
| `--profile <name>` | Target a specific profile (creating it if missing). Works with both `--setup-*` flags and `--setup`. |

#### The single mode question (interactive default)

Triggered when invoked as plain `hirotaskmanager` with no profile configured and no `--setup-*` flag:

```
How will this machine use TaskManager?
  [s] server  — run the API + database on this machine
                (works for both local-only and publicly-exposed setups;
                 the local CLI uses this same profile automatically)
  [c] client  — only the CLI; connect to a remote server elsewhere
```

#### Server mode (`--setup-server`)

1. **Profile name** (default: `main`).
2. **Port** (default: `3001`).
3. **Data dir** (default: `~/.taskmanager/profiles/<name>/data`).
4. **Auth dir** (default: `~/.taskmanager/profiles/<name>/auth`).
5. **Allow remote access?** [y/N] (default `N`)
   - `N` → `bind_address: "127.0.0.1"`.
   - `y` → `bind_address: "0.0.0.0"`, **forces** `require_cli_api_key: true` (validation rejects `false` for non-loopback binds). Wizard explains the implication and confirms.
6. **Require an API key for local CLI connections too?** [y/N] (default: same as the answer to step 5 — `y` if remote-accessible, otherwise `N`)
   - `y` → `require_cli_api_key: true`.
   - `N` → omit (defaults to `false` for loopback binds).
   - When step 5 was `y`, this question is forced `y` and skipped.
7. **Open browser on start?** [y/N] (default `y` for desktop, `N` for headless — auto-detected when possible).
8. Write `<profile>/config.json` with `role: "server"` and the answers above.
9. **Mint a first CLI API key now?** [Y/n] — shown when `require_cli_api_key === true`, *strongly recommended* in that case (otherwise the server is unreachable). Default `Y` when required, `N` otherwise.
   - On `Y`: run `hirotaskmanager server api-key generate --label "<hostname>" --save-to-profile`. The raw key is printed once for the operator to copy to other machines, and also saved into the just-written profile’s `api_key` field so the local CLI authenticates immediately.
10. **Set this profile as the default?** [Y/n] (default `Y` if no default exists, otherwise `N`). On `Y` writes `~/.taskmanager/config.json` → `{ "default_profile": "<name>" }`.
11. **Start the server now?** [Y/n] — if `Y`, runs `hirotaskmanager server start --background` and walks the user through the web passphrase setup at the appropriate URL.

Output of step 9 (raw key, copy instructions) is printed prominently with a clear "copy this now — it will not be shown again" warning. Subsequent client-mode setups on other machines will paste this value.

#### Client mode (`--setup-client`)

1. **Profile name** (default: `remote`).
2. **Server URL** (`api_url`): required absolute URL. Validates `http://` / `https://`; warns loudly if `http://` is used with a non-loopback host.
3. **API key** (`api_key`): required, non-empty, hidden input. Wizard reminds the operator to generate it on the server with `hirotaskmanager server api-key generate` if they haven’t.
4. Write `<profile>/config.json` with `role: "client"` and the answers above.
5. **Set this profile as the default?** [Y/n] (default `Y` if no default exists, otherwise `N`).
6. **Connectivity check** — runs `hirotm server status` against the new profile. On failure prints actionable hints (URL wrong, server down, key invalid, TLS issues).

#### Re-running `--setup`

`hirotaskmanager --setup [--profile <name>]` re-prompts the questions for that profile’s **existing role** (server or client). It does **not** allow changing `role` — to convert a profile, delete it and run the appropriate `--setup-*` mode. All current values are pre-filled; Enter keeps them.

#### Typical deployments

The same binary is installed on every machine; the chosen mode routes each install:

- **All-in-one workstation:** `hirotaskmanager --setup-server` (loopback bind, no key). One profile, used by both the local server and the local CLI.
- **VPS + remote desktop:**
  - On the VPS: `hirotaskmanager --setup-server` (loopback bind behind Caddy, or `0.0.0.0` direct → `require_cli_api_key: true` forced; mint a key inline).
  - On the desktop: `hirotaskmanager --setup-client` → paste the URL + key from the VPS step.
- **Hardened single host:** `hirotaskmanager --setup-server` with "Require an API key for local CLI connections too? = y" → loopback bind plus enforced key (good for shared workstations).

#### `profile use` — change the default profile later

```bash
hirotaskmanager profile use <name>
```

Writes `default_profile` in `~/.taskmanager/config.json`. Errors if `<name>` doesn’t exist on disk.

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
hirotaskmanager server start --background
```

Or with a systemd unit for auto-restart:

```ini
[Unit]
Description=TaskManager
After=network.target

[Service]
Type=simple
User=taskmanager
ExecStart=/home/taskmanager/.bun/bin/hirotaskmanager server start
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

Generate a CLI API key on the VPS (the wizard offers to do this inline at the end of `--setup-server`; you can also run it manually any time, server up or down):

```bash
hirotaskmanager server api-key generate --label "Desktop"
```

Copy the printed key to the desktop client profile (the client-mode wizard prompts for it). The key authenticates as `cli` principal — it cannot access web-only routes or change CLI policy.

These are two completely independent credentials with different privilege levels. The web passphrase is never shared with CLI callers.

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
| Open port exposure | Server `bind_address` defaults to `127.0.0.1`. Setting it to a non-loopback address forces `require_cli_api_key: true` (config validation rejects the unsafe combination). |
| Cookie security | `secure: true` is already set when `protocol === "https:"` in `setAuthSessionCookie`. |
| CORS | No CORS middleware in `installed` mode — SPA and API share the same origin through the reverse proxy. |
| Local-only deployments | Loopback-bound servers default to `require_cli_api_key: false` (no key needed). Operators can opt into `require_cli_api_key: true` to force key auth on the same machine (e.g. shared workstations, parity with production). |
| Same-machine multi-user | On a multi-user host, set `require_cli_api_key: true` so other local users cannot reach the API just because they can connect to `127.0.0.1`. |

---

## 6. Implementation Checklist

Ordered by dependency. Each item is a small, self-contained change.

**Profile schema + validation (shared):**

- [ ] Add `role: "server" | "client"` to `RuntimeConfigFile` in `src/shared/runtimeConfig.ts`
- [ ] Add server-only fields (`port`, `data_dir`, `auth_dir`, `open_browser`, `bind_address`, `require_cli_api_key`) and the dual-purpose `api_key`
- [ ] Add client-only field `api_url` (required for client profiles)
- [ ] Add per-role validation in the config loader (required/forbidden field matrix from §2.1) — throw `CliError(invalidConfig)` with offending fields + profile path
- [ ] Reject `require_cli_api_key: false` when `bind_address` is non-loopback
- [ ] Warn (not error) when `require_cli_api_key === true` AND `api_key` is missing on a server profile (local CLI will fail until a key is provided)
- [ ] Add resolvers: `resolveProfileRole`, `resolveApiUrl` (auto-derives loopback URL for server profiles), `resolveApiKey`, `resolveBindAddress`, `resolveRequireCliApiKey`
- [ ] Re-export resolvers from `src/cli/lib/config.ts`

**Default profile pointer:**

- [ ] Read/write helpers for `~/.taskmanager/config.json` (`{ default_profile: "<name>" }`) in `src/shared/runtimeConfig.ts` — `resolveDefaultProfileName` / `writeDefaultProfileName`
- [ ] Update `resolveProfileName` to consult the default-profile pointer when `--profile` is absent
- [ ] If neither `--profile` nor a default pointer is set and exactly one profile exists on disk, use it implicitly; otherwise error with the list of profiles and a hint to run `hirotaskmanager profile use <name>`
- [ ] Add `hirotaskmanager profile use <name>` command (errors if `<name>` is missing on disk)

**CLI client wiring:**

- [ ] Update `buildBaseUrl` in `src/cli/lib/api-client.ts` to call `resolveApiUrl` directly (works for both roles)
- [ ] Add `isLoopbackUrl` helper in `src/cli/lib/process.ts`
- [ ] Guard `startServer` / `stopServer` to require `role === "server"`
- [ ] Update unreachable hint in `api-client.ts` to branch on role + loopback (server / client-loopback / client-remote messages)

**CLI API key system (server side):**

- [ ] Create `cli-api-keys.json` read/write helpers in `src/server/cliApiKeys.ts` (hash storage, constant-time validation, same auth dir as `auth.json`, `0o600`)
- [ ] Add `hirotaskmanager server api-key generate` command (generates key, stores hash, prints raw key once; supports `--label` and `--save-to-profile`)
- [ ] Add `hirotaskmanager server api-key list` command (shows IDs, labels, dates — never the key or hash)
- [ ] Add `hirotaskmanager server api-key revoke <id-prefix>` command
- [ ] All `server api-key …` commands operate on the file system directly (no HTTP), require `role === "server"` on the active profile
- [ ] Update `authMiddleware` in `src/server/auth.ts` to use `resolveRequireCliApiKey()` (bind-address default + explicit override) and validate Bearer tokens accordingly

**Server bind address:**

- [ ] Wire `bind_address` from the server profile into Bun’s listen call in `src/server/index.ts`
- [ ] Default `bind_address` to `127.0.0.1`; non-loopback values force `require_cli_api_key: true` (enforced by config validation)

**First-run setup wizards (`hirotaskmanager`):**

- [ ] Add `--setup-server` and `--setup-client` flags (mutually exclusive)
- [ ] Plain `hirotaskmanager` with no configured profile asks the single mode question and routes to the right flow
- [ ] Implement server-mode flow (steps 1–11 of §2.8 — incl. inline `api-key generate --save-to-profile` when `require_cli_api_key === true`)
- [ ] Implement client-mode flow (steps 1–6 of §2.8)
- [ ] In both flows, offer "set as default profile" and write `~/.taskmanager/config.json`
- [ ] `hirotaskmanager --setup` re-runs the wizard for the active profile’s existing role; pre-fill values; refuse role changes (delete + re-setup to convert)

**Docs:**

- [ ] Update `AGENTS.md` — describe the two setup modes, default profile pointer, and that no `--profile` is needed for everyday commands
- [ ] Update `README.md` — two-mode setup story (`--setup-server` / `--setup-client`)
- [ ] Update `hiro-docs/mintdocs/task-manager/get-started/profiles.mdx` and `cli/server.mdx` for the new modes, default-profile pointer, and `hirotaskmanager server api-key …` commands

**Future (not required for initial remote access):**

- [ ] Web UI: Settings → CLI API Keys page (list / revoke from browser)
- [ ] `hirotaskmanager profile set <field> <value> [--profile <name>]` convenience command for non-interactive profile edits

---

## 7. Quick-Start (After Implementation)

Three scenarios cover all setups. Every scenario uses **one mode** of the wizard; nothing else needs to be configured. After setup, daily commands run with **no `--profile` argument** because each setup writes the default-profile pointer.

### 7.1 All-in-one workstation (server + local CLI on the same machine)

```bash
bun install -g hirotaskmanager

hirotaskmanager --setup-server
#   profile name                                : main
#   port                                        : 3001
#   data_dir                                    : ~/.taskmanager/profiles/main/data
#   auth_dir                                    : ~/.taskmanager/profiles/main/auth
#   allow remote access?                        : N
#   require API key for local CLI connections?  : N
#   open browser on start?                      : Y
#   set as default profile?                     : Y
#   start server now?                           : Y
# → profile "main" written, default pointer set, server running.

hirotm boards list   # works immediately, no --profile, no key
```

### 7.2 VPS install + remote desktop (most common production setup)

**On the VPS:**

```bash
bun install -g hirotaskmanager

hirotaskmanager --setup-server --profile vps
#   port                                        : 3001
#   data_dir                                    : /var/lib/taskmanager/data
#   auth_dir                                    : /var/lib/taskmanager/auth
#   allow remote access?                        : Y     (publicly exposed)
#   require API key for local CLI connections?  : Y     (forced)
#   open browser on start?                      : N
#   mint a first CLI API key now?               : Y
#       label                                   : Desktop / Cursor
#       Output: { "key": "tmk-a3f8c1...64 hex chars", "id": "tmk-a3f8", ... }
#       ^^^ COPY THIS NOW — will not be shown again.
#   set as default profile?                     : Y
#   start server now?                           : Y
```

(If the VPS sits behind Caddy/nginx, answer "allow remote access? = N" — Caddy talks to the loopback-bound Bun. Then explicitly answer "require API key for local CLI connections? = Y" so remote callers proxied through Caddy still need a key.)

Set up web auth: visit `https://tasks.example.com` in a browser, set the passphrase.

**On the desktop:**

```bash
bun install -g hirotaskmanager

hirotaskmanager --setup-client --profile work
#   api_url                  : https://tasks.example.com
#   api_key                  : tmk-a3f8c1...paste from VPS step
#   set as default profile?  : Y
#   connectivity check       : OK

hirotm boards list   # talks to the VPS, no --profile needed
hirotm tasks add --board sprint --list 3 --group 1 \
    --title "New task" --client-name "Cursor Agent"
```

### 7.3 Hardened single host (loopback bind + forced API key)

```bash
hirotaskmanager --setup-server --profile main
#   allow remote access?                        : N
#   require API key for local CLI connections?  : Y     (defense in depth)
#   mint a first CLI API key now?               : Y     (saved to profile via --save-to-profile)
#   set as default profile?                     : Y
#   start server now?                           : Y

hirotm boards list   # local CLI authenticates via api_key in the same profile
```

### 7.4 Switching the default profile later

```bash
hirotaskmanager profile use staging
# updates ~/.taskmanager/config.json → { "default_profile": "staging" }

hirotm --profile work boards list   # one-off override without changing the default
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
Con: still needs the `api_url` (required) on the client profile and `require_cli_api_key: true` on the server profile (Tailscale IPs are non-loopback).

Both alternatives still benefit from the `api_url` config field and the role-based profile model — they make the CLI flexible regardless of the network layer chosen.
