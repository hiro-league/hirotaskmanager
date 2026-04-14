# CLI testing (`hirotm`)

Scope: automated tests for the TaskManager CLI only. For the wider pyramid, see `docs/testing-strategy.md` §4.4.

---

## Coverage today (snapshot)

**Aspect 3:** `output.test.ts` (`printError` / `exitWithError`); subprocess: subcommand `--help`, empty `query search` → exit **2** + JSON stderr, Commander missing arg → exit **1** (plain stderr), stub **403** → exit **4** + JSON stderr (`subprocess.smoke.test.ts`); `handleSearch` URL default `limit=20` (`search.test.ts`). Search table remains non-JSON exception. **Aspects 1–2 (breadth):** `command-helpers`, `task-body`, `emoji-cli`, `write-result`, `runtime`; `cli-http-errors`; `api-client` (incl. **401** JSON); handlers `boards` (list/show/tasks), `search`, `statuses`, **`server` (start/stop + status)**; **`cli-wiring.test.ts`** (lists/tasks/releases/boards update/trash lists + `--port`); **`writeCommands.breadth.test.ts`** (lists/tasks/boards mutations/releases + validation); **`writeCommands.smoke.test.ts`**; **`trashCommands.breadth.test.ts`** + `trashCommands.fetch.test.ts`. **Aspect 4 (subprocess):** `subprocess.smoke.test.ts` — stub **200/403**, unreachable port, root/subcommand `--help`, validation / missing-arg paths, plus real-stack file when env set. **Real stack (opt-in):** `subprocess.real-stack.test.ts` — temp `TASKMANAGER_DATA_DIR` + `TASKMANAGER_AUTH_DIR`, `integrationPrepareAuth.ts`, child `bootstrapDev.ts` + subprocess `hirotm` (`npm run test:cli:real-stack`). Default `npm test` loads that file but **skips** those cases unless `RUN_CLI_REAL_STACK=1`. **Aspect 5 (hermetic):** default CLI unit/smoke paths avoid repo `data/`; real-stack uses disposable dirs + ephemeral port (checklist below). **Aspect 6 (auth / CLI policy):** HTTP layer maps **401 → 10**, **403 → 4**, etc.; **`fetchApi` 401** JSON case (`api-client.test.ts`); subprocess stub **403** on `boards list` (`subprocess.smoke.test.ts`). Open policy-on-real-stack items: see **Remaining work** below.

---

## Remaining work (toward completeness)

This section is the **backlog** for CLI testing after the current breadth pass. No requirement to implement everything; pick by risk and churn.

### In-process (`writeCommands`, `task-body`, `trashCommands`)

| Area | Gap |
|------|-----|
| **Text / body inputs** | `--description-file`, `--description-stdin`, `--body-file`, `--body-stdin` (and mutual exclusion) — only partially covered today; **stdin** branch for `loadBodyText` still optional in the aspect-1 list. |
| **Release by name** | `runTasksAdd` / `runTasksUpdate` with `--release <name>` triggers `GET /boards/...` to resolve id — not covered by mock tests that only POST/PATCH. |
| **Trash board by slug** | `runBoardsRestore` / `runBoardsPurge` with a **slug** first calls `GET /trash/boards` — only **numeric id** paths are covered in `trashCommands.breadth.test.ts`. |
| **Handler wiring** | Optional: explicit `handleBoardsAdd`, `handleBoardsDelete`, `handle…Restore` / `…Purge` tests (low value if `run*` coverage stays ahead of handlers). |
| **Error paths on writes** | In-process: mock **403** / **409** on `fetchApiMutate` for representative `run*` commands (aspect 6 checklist). |

### Subprocess (`subprocess.smoke.test.ts`)

| Area | Gap |
|------|-----|
| **Mutations** | Child `hirotm` + stub server for e.g. `boards add`, `tasks add` (more wiring confidence than in-process alone). |
| **More HTTP outcomes** | Stub **401**, **404**, **409** on success paths (today: **403**, unreachable, validation). |
| **Binary vs dev entry** | Smoke uses `bun run src/cli/bin/hirotm.ts`; optional release check using **installed** `hirotm` from `PATH`. |

### Real stack (opt-in, `RUN_CLI_REAL_STACK=1`)

| Area | Gap |
|------|-----|
| **Depth** | Today: `boards list`, `statuses list` only. **Writes** need seeded **CLI policy** / API key (default migrations often deny `create_board`, etc.). |
| **Policy matrix** | Global + board **cli_policy**, allow/deny per action — see aspect 6 open items. |
| **Auth failures** | Subprocess with missing/invalid API key → **401** / exit **10** if the API contract is stable. |

### Agent / UX (aspect 3)

| Area | Gap |
|------|-----|
| **Commander vs contract** | Missing required args → exit **1** + plain text today; **exit 2** + JSON is the documented direction (`docs/cli-error-handling.md`) — product/audit, then tests. |
| **Deferred** | Full command-matrix snapshots, per-command JSON schemas, line-by-line **Building CLI for Agents** review. |
| **Future flags** | Any `--all`-style flag: document here + bounded-default test. |

### Hermetic / CI (aspect 5)

Optional: CI **grep guard** for `taskmanager.db` in `src/cli/**/*.test.ts`, **parallel worker** isolation if Bun runs workers, **named `test` profile** for subprocess suites that must hit real profile resolution.

### Outside this doc

- **Server** route tests for endpoints the CLI relies on (complementary to CLI tests).
- **Mintlify / AGENTS.md** kept in sync when flags or exit behavior change.

---

## Aspects to cover

### 1. Behavior & correctness

- **Pure helpers** — Parsers, id resolution, mappers (fast, no I/O).
- **Handlers** — Given a `CliContext` (injected `fetch` / printers), stdout and side effects match expectations.
- **Command wiring** — Optional: argv → correct handler (often deferred in favor of handler tests).

### 2. HTTP & errors

- **Status → contract** — Stable exit codes and stderr JSON (`code`, `retryable`, etc.) for representative statuses.
- **Client edge cases** — Timeouts, unreachable server, malformed bodies (where not already covered by shared tests).

### 3. Agent / UX compliance

Align checks with **Building CLI for Agents** in the Hiro docs repo: `hiro-docs/mintdocs/ai-coding-bible/building-cli-for-agents.mdx` (sibling of this repo in a multi-root workspace, or clone alongside). Use it as a **checklist**, not a requirement to implement every pattern tomorrow.

- **Structured output** — Success JSON on stdout; noise on stderr; consistent shapes across commands where applicable.
- **Exit codes** — Documented mapping; failures non-zero; usage vs not-found vs conflict distinguishable.
- **Actionable errors** — Stable `code` strings, machine-readable fields agents can branch on.
- **Discoverability** — `--help` and subcommand layout stay coherent (spot-check or snapshot sparingly).
- **Context discipline** — List/search paths stay bounded by default; document any `--all`-style flags when added.

Concrete automation ideas: **Tests to add — aspect 3** (below).

### 4. Integration depth

- **In-process** — Handlers + mocked `fetchApi` (current direction for bulk coverage).
- **Subprocess smoke** — Spawn `bun run src/cli/bin/hirotm.ts` (or packaged binary) against a **stub HTTP** server or expect **unreachable** behavior; assert exit code + stdout/stderr JSON. Catches argv/bootstrap issues handlers alone miss. Implemented: `src/cli/subprocess.smoke.test.ts`.
- **Real API + SQLite (opt-in)** — Disposable dirs + `setupPassphrase` + child dev server + subprocess `hirotm` against **real** Hono + migrations. Implemented: `src/cli/subprocess.real-stack.test.ts` + `src/server/scripts/integrationPrepareAuth.ts`; run `npm run test:cli:real-stack` (not part of the default `release:check` test count as *executed* — those tests stay skipped unless env is set).

### 5. Hermetic runs

- **No dev DB** — Tests do not use `data/taskmanager.db` unless explicitly local-only.
- **Temp / in-memory** — Prefer injected deps or a dedicated test app + DB when testing real HTTP.

Concrete items: **Tests to add — aspect 5** (below). Profile / `~/.taskmanager` isolation for subprocess suites is summarized under **Test environments: profiles**.

### 6. Authorization / CLI policy

- **403 / exit 4 paths** — When the API denies an action, stderr JSON and exit code match `docs/cli-error-handling.md`.
- **Fixtures** — Seed boards (or lists/tasks) with **tight** `cliPolicy` in a disposable DB, then run the CLI with an API key that should be **blocked** for some actions and **allowed** for others. Manual setup is fine for exploration; automation usually goes through the same HTTP/storage layer the app uses (not hand-editing sqlite unless you explicitly want DB-level tests).

Concrete items: **Tests to add — aspect 6** (below). Contract tables: `docs/cli-error-handling.md`.

---

## Test environments: profiles

CLI and server both resolve **profile** → config under `~/.taskmanager/profiles/<name>/config.json` (`port`, `data_dir`, `auth_dir`, `api_key`, …). See `src/shared/runtimeConfig.ts`.

- **Isolated automation** — Use a dedicated profile (e.g. `test` or `ci`) with **`data_dir`** pointing at a **temp directory** (unique per parallel worker if needed) and a **free port** so runs do not touch the developer’s default DB or port.
- **`dev` profile caveat** — Default dev data dir is the **repo `data/`** tree; avoid that for hermetic CI unless you intentionally override `data_dir` in profile config or env.
- **Subprocess + real HTTP** — Start the server with the same profile, port, and data paths, then invoke `hirotm … --profile <name>` so base URL and DB stay aligned.

---

## Tests to add — aspect 1 (behavior & correctness)

Checklist for new `*.test.ts` (or expanded cases in existing files). Prefer **in-process** tests with **injected `CliContext`** for handlers; **no live server** unless marked integration.

### Pure helpers & parsers

- [x] **`command-helpers`** — `parsePortOption`, `collectMultiValue`, `parseLimitOption`, Commander option registration (`command-helpers.test.ts`).
- [x] **`task-body`** — `resolveExclusiveBody`, `loadBodyText` flag + file (`task-body.test.ts`). *Optional later:* stdin branch.
- [x] **`emoji-cli`** — `parseOptionalEmojiFlag` (`emoji-cli.test.ts`).
- [x] **`write-result`** — compact helpers + envelopes (`write-result.test.ts`).
- [x] **`runtime` (argv)** — `readClientNameArg`, `readProfileArg` (`bootstrap/runtime.test.ts`).

### Handlers (mock `fetchApi`, `printJson`, stubs for server helpers as needed)

- [x] **`boards`** — Read paths: `handlers/boards.test.ts`. Writes: `runBoardsUpdate`, `runBoardsDelete`, `runBoardsGroups`, `runBoardsPriorities` in `lib/writeCommands.breadth.test.ts`; `handleBoardsUpdate` port wiring in `handlers/cli-wiring.test.ts`. Optional extra handler-only wiring: see **Remaining work**.
- [x] **`lists`** — `runLists*` (including `runListsList`) in `writeCommands.breadth.test.ts` + `writeCommands.smoke.test.ts`; `handleListsAdd` / `handleListsList` port wiring in `cli-wiring.test.ts`.
- [x] **`tasks`** — `runTasks*` in `writeCommands.breadth.test.ts`; `handleTasksAdd` port wiring in `cli-wiring.test.ts`.
- [x] **`releases`** — `runReleases*` in `smoke` + `breadth`; `handleReleasesAdd` wiring in `cli-wiring.test.ts`.
- [x] **`search`** — JSON + table branches, validation (`handlers/search.test.ts`).
- [x] **`statuses`** — `handleStatusesList` (`handlers/statuses.test.ts`).
- [x] **`trash`** — `runTrashLists` / `runTrashTasks` / restore / purge in `lib/trashCommands.breadth.test.ts`; `runTrashBoards` in `trashCommands.fetch.test.ts`; `handleTrashLists` wiring in `cli-wiring.test.ts`.
- [x] **`server`** — Status + **start** (background + foreground stub) + **stop** (`handlers/server.test.ts`).

### Write-path runners (`writeCommands`)

- [x] **Smoke** — `lib/writeCommands.smoke.test.ts` (releases list/show, boards add).
- [x] **Breadth** — `lib/writeCommands.breadth.test.ts` (lists, tasks, boards update/delete/groups/priorities, releases add/update/delete, validation cases).

---

## Tests to add — aspect 2 (HTTP & errors)

Contract reference: `docs/cli-error-handling.md`.

### `mapHttpStatusToCliFailure`

- [x] **Status table** — Representative statuses + 599 + unmapped 4xx (`cli-http-errors.test.ts`).
- [x] **`serverCode`** — String `code` from body → `serverCode`; non-string ignored.

### `api-client` (mock `globalThis.fetch`)

- [x] **`fetchApi`**, **`fetchApiMutate`**, **`fetchApiTrashMutate`**, **`fetchHealth`** — Success, **401** JSON, error mapping, `AbortError` vs connection throw, 204 (`api-client.test.ts`).

---

## Tests to add — aspect 3 (agent / UX compliance)

Goal: behavior agents rely on — **machine-readable success and failure**, **discoverability**, and **bounded defaults** — without a full human “CLI review” or brittle full-text snapshots. Align ad hoc with **Building CLI for Agents** (`hiro-docs/.../building-cli-for-agents.mdx`); this list is what you can automate **now** vs defer.

### Exit codes (agent branching)

- [x] **HTTP-derived failures** — Table + client (`cli-http-errors.test.ts`, `api-client.test.ts`); overlaps aspect 2.
- [x] **Validation / usage-style failures** — Example: search empty query / bad `--format` → exit **2** + `code` (`handlers/search.test.ts`).
- [x] **Subprocess validation (handler path)** — `query search … ""` → exit **2**, stderr JSON (`subprocess.smoke.test.ts`). **Commander** missing required arg (`boards describe` with no id) → exit **1**, plain stderr today (`subprocess.smoke.test.ts`); aligning with exit **2** is a separate audit (`docs/cli-error-handling.md`).

### Actionable errors (stderr JSON)

- [x] **Unreachable server** — Subprocess exit **6**, stderr JSON with `code`, `retryable`, `hint` (`subprocess.smoke.test.ts`).
- [x] **`printError` / stderr payload** — Unit tests: top-level `error`, hoisted `code` / `retryable`, merged fields; `exitWithError` for `CliError`, generic `Error`, and unknown (`output.test.ts`). Exercises the same shaping as `buildStderrPayload` inside `output.ts`.

### Structured output

- [x] **JSON success on stdout** — Handlers via injected `printJson`; subprocess + real-stack assert JSON on stdout and **empty stderr** on success (`subprocess.smoke.test.ts`, `subprocess.real-stack.test.ts`).
- [x] **End-to-end stderr JSON on API failure** — Subprocess + stub **403** JSON → exit **4**, stderr `error` + `code` (`subprocess.smoke.test.ts`).
- [x] **`query search` with `--format human`** — Fixed-width table on stdout; covered in `handlers/search.test.ts`.

### Discoverability (`--help`)

- [x] **Root** — `hirotm --help` exits **0**, usage mentions `hirotm` (`subprocess.smoke.test.ts`).
- [x] **Subcommands (spot-check)** — `hirotm boards --help`, `hirotm query search --help` (`subprocess.smoke.test.ts`).

### Context discipline (bounded defaults)

- [x] **Search `--limit`** — Default **20**, cap **50** (`parseLimitOption` in `command-helpers.test.ts`); wire check: `handleSearch` with no `limit` in options → URL contains `limit=20` (`search.test.ts`).
- [ ] **Document `--all`-style flags** — When added, describe in this doc + add a test that default remains bounded.

### Defer (needs product/doc pass or high churn)

- Full **command matrix** snapshots or golden stdout for every subcommand.
- **Strict JSON shape** contracts per command (OpenAPI-style) unless you commit to a schema.
- Line-by-line checklist against **Building CLI for Agents** until someone does that review.

---

## Tests — aspect 4 (integration depth / subprocess)

- [x] **`boards list` + stub `Bun.serve`** — Returns `GET /api/boards` → `[]`; child exits **0**; stdout is JSON (`subprocess.smoke.test.ts`).
- [x] **`boards list` + stub 403 JSON** — Exit **4**; stderr JSON `error` + `code: forbidden` (`subprocess.smoke.test.ts`; overlaps aspect 3 / 6).
- [x] **`boards list` + closed port** — Exit **6**; stderr JSON with `code: server_unreachable`, `retryable`, `hint` (`subprocess.smoke.test.ts`).
- [x] **`--help`** — Exit **0**; usage text (Commander wiring) (`subprocess.smoke.test.ts`).
- [x] **Subcommand `--help` spot-check** — `boards --help`, `query search --help` (`subprocess.smoke.test.ts`).
- [x] **Handler validation subprocess** — Empty `query search` → exit **2** + JSON stderr; Commander missing arg (`boards describe`) → exit **1** + plain stderr (`subprocess.smoke.test.ts`).
- [x] **Real stack (opt-in, `RUN_CLI_REAL_STACK=1`)** — Temp data/auth dirs, `integrationPrepareAuth.ts`, `bootstrapDev.ts` child, `hirotm boards list` → `[]`, `hirotm statuses list` → seeded rows (`subprocess.real-stack.test.ts`). Isolation uses **`TASKMANAGER_DATA_DIR`**, **`TASKMANAGER_AUTH_DIR`**, **`HOME`**, plus **`--profile`** / **`--port`** on spawned server and **`hirotm`** for an ephemeral port.

---

## Tests to add — aspect 5 (hermetic runs)

Goal: automated CLI tests do not depend on the developer’s **repo `data/`** tree or a fixed local port unless the test file is explicitly documented as local-only.

### No shared dev database

- [x] **In-process handlers / lib** — Mocked `fetch` or injected `CliContext`; no SQLite path to `data/taskmanager.db` (`handlers/*.test.ts`, `lib/*.test.ts`, `bootstrap/runtime.test.ts`).
- [x] **Subprocess smoke** — Stub `Bun.serve` or unreachable port only; no attachment to repo `data/` (`subprocess.smoke.test.ts`).
- [ ] **Repo grep / CI guard (optional)** — Fail CI if new `*.test.ts` under `src/cli/` references `taskmanager.db` or `data/taskmanager` without an allowlist comment (prevents accidental coupling).

### Real HTTP / subprocess

- [x] **Disposable state** — Real-stack suite uses `mkdtempSync` + `TASKMANAGER_DATA_DIR` / `TASKMANAGER_AUTH_DIR` + `HOME` override + teardown (`subprocess.real-stack.test.ts`).
- [x] **Ephemeral listen port** — Real-stack picks a free port (`pickEphemeralPort`); avoids colliding with dev `3001`/`3002`.
- [ ] **Parallel workers** — If `bun test` gains worker parallelism, ensure each worker gets unique temp dirs (and ports) for any future multi-fixture subprocess suites.

### Default CI path

- [x] **Slow integration off by default** — Real-stack cases skipped unless `RUN_CLI_REAL_STACK=1`; normal `npm test` does not start a long-lived server against shared disk.

### Profiles vs env overrides

- [ ] **Named `test` profile (optional)** — For subprocess suites that must exercise full profile resolution (`~/.taskmanager/profiles/...`), use a temp `data_dir` and port per run instead of the developer’s default profile.

---

## Tests to add — aspect 6 (authorization / CLI policy)

Goal: when the API rejects a call (**401**, **403**, wrong API key, or **CLI policy**), the CLI’s **exit code** and **stderr JSON** stay aligned with `docs/cli-error-handling.md`, including stable `code` / `retryable` where the contract defines them.

### HTTP status → CLI contract (shared client layer)

- [x] **Status table** — Includes **401** (exit **10**), **403** (exit **4**), **409** (exit **5**), **422** (exit **9**), etc. (`cli-http-errors.test.ts`).
- [x] **`fetchApi` / `fetchApiMutate` / `fetchApiTrashMutate`** — At least **403**, **409**, **400** paths produce `CliError` with expected `exitCode` and `details.code` (`api-client.test.ts`).
- [x] **`fetchApi` explicit 401** — JSON body → exit **10**, `unauthenticated`, `serverCode` (`api-client.test.ts`).

### Handlers & write runners (mock `fetch` returning errors)

- [ ] **Read paths** — Representative handlers: mock `fetchApi` rejects with **403** / **401**; assert process exit path or thrown `CliError` matches contract (stdout empty on failure, stderr shape if tested via integration helper).
- [ ] **Write paths** — `writeCommands` / trash mutators: **403** on `POST`/`PATCH`/`DELETE` maps to exit **4**; **409** → **5** where applicable.
- [ ] **Board index `cliPolicy`** — Today list/show fixtures may include `cliPolicy` for shape only (`handlers/boards.test.ts`); add tests only when the CLI **interprets** policy client-side (otherwise server is source of truth and **403** tests above suffice).

### Subprocess

- [x] **`hirotm` + mock server returning 403** — Child exits **4**; stderr parses as JSON with expected `code` (`subprocess.smoke.test.ts`; complements aspect 3 E2E failure JSON).

### Real stack (opt-in)

- [ ] **Global + board CLI policy** — In a disposable DB (same pattern as `subprocess.real-stack.test.ts`), enable or seed **`cli_global_policy`** and board CLI access so one API key is **allowed** for reads but **denied** for a specific write; subprocess `hirotm` asserts exit code + stderr JSON.
- [ ] **Missing / invalid API key** — Subprocess against real server with profile or env lacking a valid key → **401** / exit **10** (if the server returns that for CLI routes).

---

## Run tests (CLI-focused)

From repo root:

```bash
# Full suite (includes server, client, shared — same as CI test step)
npm test
# or
bun test
```

Note: `subprocess.real-stack.test.ts` is **discovered** but its cases are **skipped** unless `RUN_CLI_REAL_STACK=1`, so you will see **2 skipped** tests in a normal run.

```bash
# Real Hono + SQLite + subprocess hirotm (slower; cross-platform via wrapper)
npm run test:cli:real-stack
```

```bash
# Only CLI tree (handlers, lib, bootstrap). Trailing slash avoids matching `src/client`.
bun test ./src/cli/
```

```bash
# Single file (examples)
bun test src/cli/lib/api-client.test.ts
bun test src/cli/handlers/boards.test.ts
bun test ./src/cli/subprocess.smoke.test.ts
```

```bash
# Coverage: text summary in terminal + lcov under coverage/ (open with genhtml or IDE “Coverage Gutters”)
bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage ./src/cli/
```

Filter by test name:

```bash
bun test --test-name-pattern "handleSearch" ./src/cli/
```

---

## See also

**Wrap-up:** The six “aspects” are a taxonomy; the **Remaining work** section is the single backlog for “more complete” CLI testing. Checklists above mark what is already automated.

- `docs/coverage-review.md` — LCOV + `genhtml` HTML reports on Windows.
- `docs/testing-strategy.md` — phases, subprocess vs injectable handlers.
- `docs/cli-rearchitecture.md` — target shape for testable handlers.
- `docs/cli-error-handling.md` — maintainer contract for stderr JSON and exit codes.
