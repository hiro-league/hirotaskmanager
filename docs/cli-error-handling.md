# hirotm CLI — error handling contract

This document defines the **contract** for process exit codes and structured errors for `hirotm` (implemented in `src/cli/lib/output.ts`, `api-client.ts`, `cli-http-errors.ts`, and related call sites). It maps **problem categories** in `docs/todo.md` to **`$?` values**, describes how **agents** should react, and lists **maintenance notes** for future changes.

**Related:** `docs/hirotm-vs-building-cli-for-agents-review.md`, `AGENTS.md`.

**Operator / agent catalog (no repo paths):** Mintlify **Task Manager → Errors & exit codes** (`hiro-docs/mintdocs/task-manager/cli/hirotm-error-codes.mdx`), route `/task-manager/cli/hirotm-error-codes`.

---

## 1. Problem categories (source: `docs/todo.md`)

These describe *what went wrong* from a product perspective:

| Cat | Description |
|-----|-------------|
| **1** | Server is not running, or was started but is not working. |
| **2** | Not authorized — CLI policy problem. |
| **3** | Not authenticated — future requirement. |
| **4** | CLI flags / usage — validated in the CLI before (or without) a definitive API response. |
| **5** | Parameter issues detected by the API: bad format, missing fields, or an id/value that does not exist in the DB. |
| **6** | Unsupported version — future: API and CLI version skew. |
| **7** | API not responding in time — timeout. |
| **8** | DB / system errors — DB file missing, internal DB errors; often not actionable for the agent beyond retry or escalate. |

Category **5** intentionally mixes *validation* and *missing resource*; the **exit-code plan below splits those** so agents can branch correctly (fix input shape vs fix id/slug).

---

## 2. Planned shell exit codes (`$?`)

POSIX only standardizes **0 = success** and **non-zero = failure**. Numeric meanings beyond that are **this project’s contract** (documented here). The table is chosen to stay close to common CLI patterns (e.g. **2** = usage) while covering TaskManager-specific cases.

| Exit | Symbolic name | Meaning |
|------|----------------|---------|
| **0** | `success` | Command succeeded; data JSON on stdout as today. |
| **1** | `error` | Generic / internal failure: unexpected errors, most **5xx**, DB failures (**cat 8**), or anything that does not map cleanly. |
| **2** | `usage` | Invalid or incomplete CLI invocation (**cat 4**). |
| **3** | `not_found` | Target resource does not exist (typically HTTP **404** or equivalent) — subset of **cat 5**. |
| **4** | `forbidden` | Caller not allowed to perform the action: CLI policy, **403**, etc. (**cat 2**). |
| **5** | `conflict` | Duplicate or conflicting state (typically **409** or explicit conflict in body). |
| **6** | `unavailable` | No usable HTTP response from the app: not running, connection failure, unhealthy (**cat 1**). |
| **7** | `timeout` | Operation exceeded a time limit (**cat 7**). |
| **8** | `version_mismatch` | CLI and API are incompatible (**cat 6**, future). |
| **9** | `bad_request` | API rejected the request as a client mistake: validation, bad JSON shape (**400**) — rest of **cat 5** when not “not found”. |
| **10** | `unauthenticated` | Auth required or credentials invalid (**401**, **cat 3**) — optional until auth exists; see §5. |

---

## 3. Mapping: categories → exit code + stderr `code`

Stderr remains **JSON** (today: `{ "error": "<message>", ... }`). The plan adds a stable string field **`code`** (and optionally **`retryable`**) for fine-grained agent logic without growing `$?` unnecessarily.

| Cat | Primary `$?` | Example `code` values (stderr) | Notes |
|-----|--------------|---------------------------------|-------|
| **1** | **6** | `server_unreachable`, `connection_refused`, `server_unhealthy` | Distinct from timeout (**7**). |
| **2** | **4** | `cli_forbidden`, `policy_denied` | User fixes policy in the web app. |
| **3** | **10** (or **4** until auth ships) | `unauthenticated`, `invalid_token` | Map **401** here when API distinguishes from **403**. |
| **4** | **2** | `invalid_option`, `missing_required`, `invalid_value` | Fix argv; do not retry the same line. |
| **5** | **3** or **9** | `not_found` vs `validation_error`, `invalid_body` | **404** → **3**; **400** → **9** (if API is consistent). |
| **6** | **8** | `cli_too_old`, `api_too_old` | Requires version handshake (future). |
| **7** | **7** | `request_timeout`, `server_start_timeout` | Retry/backoff; not the same as **6**. |
| **8** | **1** | `internal_error`, `database_error` | Agent: usually report or retry later, not a specific fix. |

**Conflict (duplicate resource):** **cat 5** might also surface as **409** → map to **`$?` = 5**, `code: "conflict"` (or more specific), not **9**.

**Where the API uses 409 today:** board **release** create/rename when the name collides on that board; **Trash** restore for a list/task when the board or list is still trashed. Other server paths (for example task **group** or **priority** patches that throw on duplicate labels/values) may still respond with **400** until they are aligned the same way.

---

## 4. How agents should interpret each exit code

| `$?` | Interpretation | Typical next step |
|------|----------------|-------------------|
| **0** | Success | Parse stdout JSON; continue. |
| **1** | Generic / server / DB failure | Read stderr JSON; if `retryable: true`, backoff and retry; else surface to user. |
| **2** | Usage / CLI validation | Fix flags and arguments; **do not** retry unchanged. |
| **3** | Missing resource | Refresh ids/slugs (`boards list`, `boards describe`, etc.); adjust target id. |
| **4** | Forbidden / policy | **Do not** retry mutations; user must change CLI access or permissions. |
| **5** | Conflict | Use idempotent strategy, skip create, or resolve duplicate. |
| **6** | Unreachable / down | Run `hirotm server start …` (use `hint` when present), check `--profile` / port. |
| **7** | Timeout | Retry with delay or increase timeout; distinguish from **6**. |
| **8** | Version skew | Upgrade CLI or TaskManager app per message. |
| **9** | Bad request (API validation) | Fix request body/params per `error` / `code`; different from **3**. |
| **10** | Unauthenticated | Configure API key or complete login flow when implemented. |

Agents should prefer **`code`** inside stderr JSON when present; **`$?`** is for coarse branching when parsing is skipped.

---

## 5. Auth split (**403** vs **401**)

- **403** → **`$?` = 4** (`forbidden`) — authenticated or anonymous, but **not allowed** (includes CLI policy denial).
- **401** → **`$?` = 10** (`unauthenticated`) when the API uses it for missing/invalid credentials (**cat 3**).

Until the API exposes **401** for CLI flows, **401** can be mapped to **4** with `code: "unauthenticated"` to avoid reserving **10** prematurely—document the chosen rule in `AGENTS.md` when implementing.

---

## 6. Planned stderr JSON shape (additive)

```json
{
  "error": "Human-readable message",
  "code": "stable_snake_case",
  "retryable": false,
  "hint": "Optional copy-paste recovery command or hint",
  "status": 404,
  "url": "http://127.0.0.1:3002/api/..."
}
```

- **`error`**: required string (keep for humans and logs).
- **`code`**: required for all **new** mapped paths; legacy paths may omit until migrated.
- **`retryable`**: optional boolean; helps agents without overloading `$?`.
- Existing spread fields (`status`, `url`, `hint`, …) remain as today where applicable.

---

## 7. Required changes (after review)

### 7.1 CLI — centralized HTTP errors

| Area | File(s) | Work |
|------|---------|------|
| Map `response.status` → exit **3 / 4 / 5 / 9** (and **10** when used) | `src/cli/lib/api-client.ts` (`fetchApi`, `fetchApiMutate`, `fetchApiTrashMutate`) | **Small:** one helper, e.g. `httpStatusToExitCode(status)`, plus set `code` from status or body. |
| Network / fetch failure (no response) | Same | Remap from exit **1** to **6**; set `code: "server_unreachable"`; keep `hint`. |
| Optional fetch timeout | Same + config | **Done:** `DEFAULT_CLI_FETCH_TIMEOUT_MS` (120s) in `api-client.ts` → exit **7**, `code: "request_timeout"`. |
| Server start wait timeout | `src/cli/lib/process.ts` (or equivalent) | Map to **7** with `server_start_timeout`. |

### 7.2 CLI — errors and printing

| Area | File(s) | Work |
|------|---------|------|
| `CliError` + `printError` | `src/cli/lib/output.ts` | **Small–medium:** ensure `code` (and optional `retryable`) are first-class; document shape. |
| Local validation | `src/cli/lib/command-helpers.ts`, `src/cli/lib/writeCommands.ts`, handlers | Ensure **usage** cases use **`$?` = 2** consistently; attach `code` where easy. |

### 7.3 API / server (only if HTTP semantics are inconsistent)

| Condition | Work |
|-----------|------|
| **404** vs **400** already correct for “id not found” vs “bad input” | **No** per-route CLI work beyond central mapping. |
| Many failures return **400** for everything | **Medium:** normalize status codes or add stable `code` in JSON error bodies; CLI reads body in `parseErrorResponse` already. |

### 7.4 Documentation

| File | Work |
|------|------|
| `AGENTS.md` | Table of exit codes + pointer to this doc; stderr JSON shape. **Done.** |
| `docs/hirotm-vs-building-cli-for-agents-review.md` | Cross-link to this doc. **Done.** |
| `.cursor/skills/hirotm-cli/SKILL.md` | Note on `$?` and `code`. **Done.** |

### 7.5 Future items

| Item | Cat | Notes |
|------|-----|------|
| Version handshake | **6** / exit **8** | Header or error body; CLI checks once per run or per request. |
| Full **401** handling | **3** / exit **10** | When CLI auth exists. |

---

## 8. Implementation order (suggested)

1. Add **`code`** (and optional **`retryable`**) to stderr output and `CliError`.
2. Implement **HTTP status → exit code** + **`code`** in `api-client.ts` for all three fetch helpers.
3. Remap **network unreachable** to exit **6** (keep **hint**).
4. Audit **`CliError(..., 1)`** that are really usage → **2**.
5. Add **timeouts** → **7** if desired in the same pass or follow-up.
6. Update **AGENTS.md** + skill.
7. Server-only follow-up if **400/404/409** are inconsistent.

---

## 9. Status

| State | Description |
|-------|-------------|
| **Implemented** | Exit codes, HTTP mapping, fetch timeout, stderr `code` / `retryable`, and docs (`AGENTS.md`) are in place per §7–§8. |
| **Output format** | Global `--format ndjson|human` (`program.ts` → `cliFormat.ts`). Default **ndjson**: list/search stdout uses `printNdjsonLines`; `printJson` / `printError` emit compact single-line JSON. **human**: list/search tables via `renderRecordsTable`; `printJson` / labeled success; `printError` → plain text stderr (`src/cli/lib/output.ts`, `humanText.ts`). |

Adjust server HTTP statuses or error bodies only if you need finer agent behavior than status-based mapping provides.
