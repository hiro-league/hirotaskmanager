# CLI test plan — command-driven, comprehensive

Scope: automated tests for the `hirotm` CLI. Organized **top-down by command/feature**, not by abstract aspect. Each section specifies the **test file**, **test style**, **exact tests to write**, and **what to assert**. An implementing agent should be able to build each section as-is.

Abiding by **no-backward-compatibility** rule (initial development mode).

**Relationship to existing tests:** sections mark tests that already exist with `[EXISTS]`. New tests are unmarked. Existing test files should be extended in-place where the section maps to a file that already exists; new files are created only where noted.

---

## Table of contents

1. [Testing infrastructure](#1-testing-infrastructure)
2. [Shared pipelines](#2-shared-pipelines)
3. [Commands — reads](#3-commands--reads)
4. [Commands — writes](#4-commands--writes)
5. [Commands — trash](#5-commands--trash)
6. [Commands — server](#6-commands--server)
7. [Global option interactions](#7-global-option-interactions)
8. [Error contract](#8-error-contract)
9. [Subprocess smoke](#9-subprocess-smoke)
10. [Real-stack integration](#10-real-stack-integration)

---

## 1. Testing infrastructure

### 1.1 Test helpers (already in use — reference for new tests)

All tests use `bun:test`. The following patterns are established:

| Pattern | Where | How to reuse |
|---------|-------|--------------|
| Mock `CliContext` | `handlers/boards.test.ts` | `mockContext({ fetchApi: ... })` — spread `createDefaultCliContext()` + override ports |
| `captureStdout(fn)` | `handlers/cli-wiring.test.ts`, `writeCommands.breadth.test.ts` | Monkey-patches `process.stdout.write`, returns captured string |
| Mock `globalThis.fetch` | `writeCommands.breadth.test.ts`, `cli-wiring.test.ts` | Save original in `origFetch`, restore in `afterEach` |
| `createTestCliRuntime()` | `lib/runtime.ts` | Deterministic `CliRuntime` with overridable fields |
| `resetCliOutputFormat()` | `lib/output.ts` | Call in `afterEach` when test sets global format/quiet |
| `spawnHirotm(args, env?)` | `subprocess.smoke.test.ts` | `Bun.spawn` with `bun run hirotm.ts`, pipe stdout/stderr |
| `Bun.serve({ port: 0 })` | `subprocess.smoke.test.ts` | Ephemeral-port stub HTTP for subprocess tests |
| `pickEphemeralPort()` | `subprocess.real-stack.test.ts` | Reserves and releases a free port |
| `readSubprocessStream(stream)` | both subprocess files | Reads `Bun.spawn` piped stream to string |

### 1.2 Shared `captureStderr` helper (new — add to a shared test util)

Several new tests need to capture stderr. Create once, reuse everywhere.

**File:** `src/cli/lib/testHelpers.ts` (test-only, not shipped)

```typescript
export async function captureStderr(run: () => Promise<void>): Promise<string> {
  let buf = "";
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array, ..._args: unknown[]): boolean => {
    buf += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    return true;
  };
  try { await run(); } finally { process.stderr.write = orig; }
  return buf;
}
```

Also move the existing `captureStdout` into the same file so both `writeCommands.breadth.test.ts` and `cli-wiring.test.ts` can import it instead of duplicating.

---

## 2. Shared pipelines

These are the cross-cutting modules that every list command flows through. Testing them in isolation prevents bugs from rippling across every read command.

### 2.1 `paginatedFetch.ts`

**File:** `src/cli/lib/paginatedFetch.test.ts` (new)

#### `paginationQuery`

| # | Test | Input | Assert |
|---|------|-------|--------|
| 1 | offset 0, limit 20 | `(0, 20)` | `"?limit=20"` |
| 2 | offset > 0 | `(10, 20)` | `"?limit=20&offset=10"` |
| 3 | limit null (no cap) | `(0, null)` | `""` |
| 4 | limit null + offset | `(5, null)` | `"?offset=5"` |

#### `fetchAllPages`

| # | Test | Setup (mock `fetchPage`) | Assert |
|---|------|--------------------------|--------|
| 1 | single page covers all | Returns `{ items: [a,b], total: 2, limit: 2, offset: 0 }` | Merged result: `items` length 2, `offset` 0, `limit` 2 |
| 2 | two pages | Page 0: `{ items: [a], total: 2, ... }`, Page 1: `{ items: [b], total: 2, ... }` | Merged: items `[a, b]`, total 2 |
| 3 | empty first page | `{ items: [], total: 0, ... }` | Returns empty items, total 0 |
| 4 | server returns fewer items than expected (partial page) | Page 0: items length 1, total 3; Page 1: items length 0, total 3 | Loop terminates, returns items collected so far |
| 5 | `fetchPage` called with correct offsets | Track offsets passed to `fetchPage` (pageSize=2) | First call offset=0, second offset=2, etc. |

### 2.2 `executePaginatedListRead` (`paginatedListRead.ts`)

**File:** `src/cli/lib/paginatedListRead.test.ts` (new)

These tests inject a mock `fetchPage` function and assert the full pipeline: field validation → limit/offset parsing → fetch → projection → print.

| # | Test | Options | Assert |
|---|------|---------|--------|
| 1 | default single page (no flags) | `{}` | Calls `fetchPage` once; stdout has NDJSON lines matching items |
| 2 | `--limit 5 --offset 10` | `{ limit: "5", offset: "10" }` | URL contains `limit=5&offset=10` |
| 3 | `--page-all` | `{ pageAll: true }` | Calls `fetchAllPages` loop; stdout contains all items |
| 4 | `--fields taskId,title` | `{ fields: "taskId,title" }` | Each stdout line has only `taskId` and `title` keys |
| 5 | `--fields unknownKey` | `{ fields: "unknownKey" }` | Throws `CliError` exit 2, code `invalid_value` |
| 6 | `--page-all --limit 3` | `{ pageAll: true, limit: "3" }` | Uses limit=3 as page size for `fetchAllPages` |

Use the `"optionalLimit"` spec kind with a fake `basePath` and `fetchPage` that returns canned `PaginatedListBody` data. Capture stdout to verify output.

### 2.3 `textTable.ts` — `renderRecordsTable`

**File:** `src/cli/lib/textTable.test.ts` (new)

| # | Test | Input | Assert |
|---|------|-------|--------|
| 1 | empty rows | `rows: []` | Returns `"No rows.\n"` |
| 2 | one row, two columns | `[{ id: 1, name: "A" }]`, columns `[{key:"id", header:"Id", width:4}, {key:"name", header:"Name", width:10}]` | Header line contains "Id" and "Name"; separator line is dashes; data row contains "1" and "A" |
| 3 | cell truncation | Value longer than column width | Ends with `…` |
| 4 | footer lines appended | `footerLines: ["total 5"]` | Last line is `"total 5\n"` |
| 5 | missing key in row | Row lacks a column key | Cell is empty string, no crash |
| 6 | null / object values | `null` → empty; `{a:1}` → JSON string | Correct serialization |

### 2.4 `humanText.ts` — `linesForHumanObject`

**File:** `src/cli/lib/humanText.test.ts` (new)

| # | Test | Input | Assert |
|---|------|-------|--------|
| 1 | flat object | `{ id: 1, name: "A" }` | Two lines: `"id: 1"`, `"name: A"` (ignore ANSI) |
| 2 | nested object | `{ a: { b: 1 } }` | Line: `"a.b: 1"` |
| 3 | array value | `{ tags: [1,2] }` | Line contains JSON `[1,2]` |
| 4 | null / undefined | `null` | Single line with "value: null" |
| 5 | empty object | `{}` | Empty array |

### 2.5 `cliFormat.ts` — global format state

**File:** `src/cli/lib/cliFormat.test.ts` (new)

| # | Test | Assert |
|---|------|--------|
| 1 | default is ndjson, quiet false | `getCliOutputFormat() === "ndjson"`, `getCliQuiet() === false` |
| 2 | sync sets human | After `syncCliOutputFormatFromGlobals({ format: "human" })` → `"human"` |
| 3 | sync sets quiet | `{ quiet: true }` → `getCliQuiet() === true` |
| 4 | reset clears to defaults | Set human+quiet, call `resetCliOutputFormat()`, verify ndjson + not quiet |
| 5 | unknown format ignored | `{ format: "xml" }` → stays at current value |

### 2.6 `jsonFieldProjection.ts`

**File:** `src/cli/lib/jsonFieldProjection.test.ts` — [EXISTS], extend if any gaps.

Existing tests cover `parseAndValidateFields`, `projectRecord`, `projectPaginatedItems`, `projectArrayItems`. No new tests needed unless the allowlist changes.

---

## 3. Commands — reads

Each read command gets handler-level tests (injected `CliContext`, mock `fetchApi`) and subprocess tests (section 9). Handler tests cover: **NDJSON output**, **human output**, **quiet output**, **field projection**, **pagination flags**, **filter flags**, and **error paths**.

### 3.1 `boards list`

**File:** `src/cli/handlers/boards.test.ts` — [EXISTS], extend.

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | NDJSON — prints one JSON line per board | [EXISTS] | Each line parses to board object |
| 2 | `--quiet` — prints slug per line | [EXISTS] | Plain text, one slug per line |
| 3 | `--format human` — fixed-width table | NEW | Stdout contains column headers ("Id", "Slug", "Name"), separator dashes, board data, footer with total |
| 4 | `--fields boardId,name` — projects NDJSON | NEW | Each line has only `boardId` and `name` |
| 5 | `--fields` + `--quiet` with one field | NEW | One value per line matching the field |
| 6 | `--page-all` — fetches all pages | NEW | Mock returns 2 pages; stdout contains all items |
| 7 | empty result set | NEW | NDJSON: empty stdout; human: "No rows." |
| 8 | API returns 403 | NEW | Throws `CliError` with exitCode 4, code `forbidden` |
| 9 | API returns 401 | NEW | Throws `CliError` with exitCode 10, code `unauthenticated` |

### 3.2 `boards describe`

**File:** `src/cli/handlers/boards.test.ts` — [EXISTS], extend.

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | NDJSON default — board + policy lines | [EXISTS] | First line `kind: "board"`, second `kind: "policy"` |
| 2 | `--entities list,group` — URL + output order | [EXISTS partial] | URL has `entities=group%2Clist`; output contains list and group kind rows |
| 3 | `--entities meta` — includes meta row | NEW | Output includes `kind: "meta"` line |
| 4 | `--entities` all entities | NEW | Output has board, policy, list, group, priority, release, status rows in order |
| 5 | `--format human` — sections with tables | NEW | Stdout contains section headers and table formatting |
| 6 | `--quiet` + `--format ndjson` exits 2 | NEW | `boards describe` does not support quiet; throws exit 2 |
| 7 | board not found (404) | NEW | Throws `CliError` exitCode 3, code `not_found` |

### 3.3 `tasks list` (board-scoped)

**File:** `src/cli/handlers/boards.test.ts` — [EXISTS], extend via `handleBoardsTasks`.

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | filter flags → query string | [EXISTS] | URL contains listId, groupId, priorityId, status, releaseId, dateMode, from, to |
| 2 | `--untagged` adds `__untagged__` releaseId | [EXISTS] | URL contains encoded untagged token |
| 3 | repeated `--release-id` values | NEW | Multiple `releaseId=X` params in URL |
| 4 | repeated `--group` values | NEW | Multiple `groupId=X` params in URL (already tested but verify array behavior) |
| 5 | NDJSON output with tasks | NEW | Each stdout line is a task JSON object |
| 6 | `--format human` — task table | NEW | Table with Task, Title, List, Status, Rel columns |
| 7 | `--quiet` — taskId per line | NEW | One `taskId` per line |
| 8 | `--fields taskId,title` | NEW | Projected output |
| 9 | `--page-all` | NEW | All pages fetched and concatenated |

### 3.4 `lists list`

**File:** `src/cli/handlers/lists.test.ts` (new, or extend if exists)

Tests use `handleListsList` with mock `CliContext`.

| # | Test | Assert |
|---|------|--------|
| 1 | NDJSON — one line per list | `listId`, `name`, `order` present |
| 2 | `--format human` — table | Columns: List, Name, Ord, Color, Em |
| 3 | `--quiet` — listId per line | Plain text |
| 4 | `--fields listId,name` | Projected |
| 5 | `--page-all` | Multiple pages merged |
| 6 | requires `--board` | Throws exit 2, `missing_required` |

### 3.5 `releases list`

**File:** `src/cli/handlers/releases.test.ts` (new, or extend)

| # | Test | Assert |
|---|------|--------|
| 1 | NDJSON output | One JSON line per release |
| 2 | `--format human` | Table with Id, Name, Date, Color |
| 3 | `--quiet` — releaseId per line | Plain text |
| 4 | `--fields releaseId,name` | Projected |

### 3.6 `releases show`

| # | Test | Assert |
|---|------|--------|
| 1 | NDJSON | Single JSON line with full release object |
| 2 | `--format human` | Labeled key: value lines |
| 3 | release not found (404) | Exit 3, `not_found` |

### 3.7 `statuses list`

**File:** `src/cli/handlers/statuses.test.ts` — [EXISTS], extend.

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | NDJSON — seeded rows | [EXISTS] | Lines parse to status objects with `statusId` |
| 2 | `--format human` — table | NEW | Columns: StatusId, Label, Ord, Closed |
| 3 | `--quiet` — statusId per line | NEW | Plain text |

### 3.8 `query search`

**File:** `src/cli/handlers/search.test.ts` — [EXISTS], extend.

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | empty query → exit 2 | [EXISTS] | `missing_required` |
| 2 | NDJSON hits | [EXISTS] | One JSON per hit; URL has q, limit, board |
| 3 | `--fields` vs human rejects | [EXISTS] | Exit 2 |
| 4 | `--fields taskId,title` projects | [EXISTS] | Only those keys |
| 5 | human table | [EXISTS] | Board, Id, Title, Snippet columns |
| 6 | default limit=20 | [EXISTS] | URL contains `limit=20` |
| 7 | `--quiet` — taskId per line | NEW | Plain text, one taskId per hit |
| 8 | `--limit 50` (cap) | NEW | URL contains `limit=50` |
| 9 | `--limit 999` → capped to 50 | NEW | Throws exit 2 or caps (verify behavior against `parseLimitOption`) |
| 10 | no results | NEW | NDJSON: empty stdout; human: "No rows." |
| 11 | `--board` filter in URL | NEW (partial overlap with test 2) | URL contains `board=<slug>` |

### 3.9 `trash list boards / lists / tasks`

**File:** `src/cli/handlers/trash.test.ts` (extend if exists, or add new cases)

| # | Test | Assert |
|---|------|--------|
| 1 | `trash list boards` NDJSON | Lines with `boardId`, `slug`, `deletedAt` |
| 2 | `trash list boards --format human` | Table with Id, Name, Slug, Deleted columns |
| 3 | `trash list boards --quiet` | slug per line |
| 4 | `trash list lists` NDJSON | Lines with `listId`, `name`, `boardId`, `deletedAt` |
| 5 | `trash list lists --quiet` | listId per line |
| 6 | `trash list tasks` NDJSON | Lines with `taskId`, `title`, `boardId` |
| 7 | `trash list tasks --quiet` | taskId per line |
| 8 | empty trash | NDJSON: empty stdout |

---

## 4. Commands — writes

Write commands are tested at the `run*` function level (mock `globalThis.fetch`). Each test verifies: correct HTTP method, correct URL, correct request body, correct stdout envelope, and validation errors.

### 4.1 `boards add`

**File:** `src/cli/lib/writeCommands.smoke.test.ts` — [EXISTS, has boards add]. Extend for missing cases.

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | POSTs with name | [EXISTS] | URL `/boards`, method POST, body has `name` |
| 2 | `--emoji` flag | NEW | Body has `emoji` field |
| 3 | `--description` flag | NEW | Body has `description` |
| 4 | `--description-file` | NEW | Reads file, body has description content |
| 5 | stdout writeSuccess envelope | [EXISTS] | `{ ok: true, entity: { type: "board" } }` |

### 4.2 `boards update`

**File:** `src/cli/lib/writeCommands.breadth.test.ts` — [EXISTS].

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | PATCHes name | [EXISTS] | URL `/boards/<id>`, method PATCH |
| 2 | no update fields → exit 2 | [EXISTS] | `no_update_fields` |
| 3 | no board id → exit 2 | [EXISTS] | `missing_required` |
| 4 | `--emoji` and `--emoji-clear` | NEW | Body has `emoji` or `emoji: null` |
| 5 | `--description` update | NEW | Body has `description` |
| 6 | `--format human` stdout | NEW | Human labeled-line output (not JSON) |

### 4.3 `boards delete`

**File:** `src/cli/lib/writeCommands.breadth.test.ts` — [EXISTS].

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | GET then DELETE flow | [EXISTS] | Two fetch calls (GET board, DELETE board) |
| 2 | stdout trash envelope | [EXISTS] | `{ trashed: { type: "board" } }` |
| 3 | `--format human` stdout | NEW | Human output |

### 4.4 `boards configure groups`

**File:** `src/cli/lib/writeCommands.breadth.test.ts` — [EXISTS].

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | PATCH with empty arrays | [EXISTS] | URL `/boards/<id>/groups`, method PATCH |
| 2 | `--json` with creates/updates/deletes | NEW | Body contains correct structure |
| 3 | `--file` reads JSON from disk | NEW | Loads file, parses, sends correct body |
| 4 | invalid JSON → exit 2 | NEW | `invalid_json` |

### 4.5 `boards configure priorities`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | PATCH with empty array | [EXISTS] | URL has `/priorities`, body `{ taskPriorities: [] }` |
| 2 | `--json` with priority entries | NEW | Body has array of priority objects |

### 4.6 `lists add`

**File:** `src/cli/lib/writeCommands.breadth.test.ts` — [EXISTS].

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | POSTs with name | [EXISTS] | URL, method, body |
| 2 | `--emoji` flag | NEW | Body includes emoji |
| 3 | requires `--board` | [EXISTS] | Exit 2 |
| 4 | stdout envelope | [EXISTS] | `{ ok: true, entity: { type: "list" } }` |

### 4.7 `lists update`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | PATCHes name | [EXISTS] | URL, method, body |
| 2 | no patch fields → exit 2 | [EXISTS] | `no_update_fields` |

### 4.8 `lists delete`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | DELETEs and prints trash | [EXISTS] | `{ trashed: { type: "list" } }` |

### 4.9 `lists move`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | PUTs move body with `--first` | [EXISTS] | Body has `position: "first"` |
| 2 | `--last` position | NEW | Body has `position: "last"` |
| 3 | `--before-list` | NEW | Body has `position: "before"`, `beforeListId` |
| 4 | `--after-list` | NEW | Body has `position: "after"`, `afterListId` |
| 5 | multiple placement flags → exit 2 | [EXISTS] | `mutually_exclusive_options` |

### 4.10 `tasks add`

**File:** `src/cli/lib/writeCommands.breadth.test.ts` — [EXISTS].

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | POSTs minimal task | [EXISTS] | Body has listId, groupId, title |
| 2 | requires `--list` and `--group` | [EXISTS] | Exit 2 if missing |
| 3 | `--priority` flag | NEW | Body has `priorityId` |
| 4 | `--release <name>` resolution | NEW | First GETs board to find release by name, then POSTs with `releaseId` |
| 5 | `--release none` | NEW | Body has `releaseId: null` |
| 6 | `--release-id <id>` | NEW | Body has `releaseId: <id>` directly |
| 7 | `--release` + `--release-id` mutual exclusion | NEW | Exit 2, `mutually_exclusive_options` |
| 8 | `--body "inline text"` | NEW | Body has `body` field |
| 9 | `--body-file <path>` | NEW | Reads file, body has content |
| 10 | `--body` + `--body-file` mutual exclusion | NEW | Exit 2, `conflicting_input_sources` |
| 11 | `--client-name` header | NEW | Request headers include `X-Client-Name` |

### 4.11 `tasks update`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | PATCHes title | [EXISTS] | URL, method, body |
| 2 | no patch fields → exit 2 | [EXISTS] | `no_update_fields` |
| 3 | `--release none` | NEW | Body has `releaseId: null` |
| 4 | `--release <name>` resolution | NEW | GETs board for lookup, PATCHes with resolved id |
| 5 | `--release <name>` not found | NEW | Exit 2, `release_not_found_by_name` |
| 6 | `--priority <id>` | NEW | Body has `priorityId` |
| 7 | `--status <id>` | NEW | Body has `status` |

### 4.12 `tasks delete`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | DELETEs and prints trash | [EXISTS] | `{ trashed: { type: "task" } }` |

### 4.13 `tasks move`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | PUTs with `--to-list` | [EXISTS] | Body has `toListId` |
| 2 | requires `--to-list` | [EXISTS] | Exit 2 |
| 3 | `--to-status` | NEW | Body has `toStatusId` |
| 4 | `--first` | NEW | Body has `position: "first"` |
| 5 | `--last` | NEW | Body has `position: "last"` |
| 6 | `--before-task` | NEW | Body has `beforeTaskId` |
| 7 | `--after-task` | NEW | Body has `afterTaskId` |
| 8 | multiple placement flags → exit 2 | NEW | `mutually_exclusive_options` |

### 4.14 `releases add`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | POSTs release | [EXISTS] | URL, method, body has `name` |
| 2 | requires name | [EXISTS] | Exit 2 |
| 3 | `--color` and `--release-date` | NEW | Body includes both fields |
| 4 | stdout envelope | [EXISTS] | `{ ok: true, entity: { type: "release" } }` |

### 4.15 `releases update`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | PATCHes name | [EXISTS] | URL, method |
| 2 | no patch fields → exit 2 | [EXISTS] | `no_update_fields` |
| 3 | `--color` and `--release-date` | NEW | Body includes both fields |

### 4.16 `releases delete`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | DELETEs and prints envelope | [EXISTS] | `{ ok: true, entity: { type: "release", deleted: true } }` |
| 2 | `--move-tasks-to <id>` | NEW | URL or body includes `moveTasksTo` |

---

## 5. Commands — trash

### 5.1 `boards restore / purge`

**File:** `src/cli/lib/trashCommands.breadth.test.ts` — [EXISTS], extend.

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | restore by numeric id | [EXISTS] | POST to `/trash/boards/<id>/restore` |
| 2 | purge by numeric id | [EXISTS] | DELETE to `/trash/boards/<id>` |
| 3 | restore by slug → resolves via GET `/trash/boards` | NEW | Calls GET first, then POST with resolved id |
| 4 | purge by slug → resolves via GET | NEW | Same resolution, then DELETE |
| 5 | slug not found in trash | NEW | Exit 3, `not_found` |

### 5.2 `lists restore / purge`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | restore by id | [EXISTS] | POST to `/trash/lists/<id>/restore` |
| 2 | purge by id | [EXISTS] | DELETE to `/trash/lists/<id>` |

### 5.3 `tasks restore / purge`

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | restore by id | [EXISTS] | POST to `/trash/tasks/<id>/restore` |
| 2 | purge by id | [EXISTS] | DELETE to `/trash/tasks/<id>` |

---

## 6. Commands — server

### 6.1 Handler-level (`handlers/server.test.ts`)

[EXISTS] — covers `handleServerStatus`, `handleServerStart` (background + foreground stub), `handleServerStop` with injected `ProcessPort`.

### 6.2 `process.ts` unit tests (new)

**File:** `src/cli/lib/process.test.ts` (new)

These test the actual `process.ts` implementation that the handler stubs skip. Use temp directories for pid files and mock `fetchHealth`.

| # | Test | Assert |
|---|------|--------|
| 1 | `readServerStatus` — healthy server, no pid file | Returns `{ running: true, port }` |
| 2 | `readServerStatus` — no health, no pid file | Returns `{ running: false }` |
| 3 | `readServerStatus` — stale pid file (process dead) + no health | Removes pid file, returns `{ running: false }` |
| 4 | `readServerStatus` — healthy + pid file with alive process | Returns `{ running: true, pid, port }` |
| 5 | `startServer` — missing port → exit 2 | Throws `CliError`, `missing_required` |
| 6 | `stopServer` — no pid file → exit 1 | Throws `CliError`, `no_managed_server` |
| 7 | `stopServer` — stale pid (dead process) | Removes pid file, throws `stale_pid` |

> Note: Tests 1–4 require mocking `fetchHealth` (inject or mock `globalThis.fetch`). Tests for actual `Bun.spawn` server lifecycle are deferred to real-stack (section 10).

---

## 7. Global option interactions

These test combinations of `--format`, `--quiet`, and `--fields` across the CLI's global option system. They verify that validation guards fire correctly.

**File:** `src/cli/lib/command-helpers.test.ts` — [EXISTS], extend.

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1 | `requireNdjsonWhenQuiet` — quiet + human → exit 2 | NEW | `CliError` with `--quiet requires ndjson` |
| 2 | `requireNdjsonWhenQuiet` — quiet + ndjson → ok | NEW | No throw |
| 3 | `requireNdjsonWhenUsingFields` — fields + human → exit 2 | NEW | `CliError` with `--fields requires ndjson` |
| 4 | `requireNdjsonWhenUsingFields` — fields + ndjson → ok | NEW | No throw |
| 5 | `resolveQuietExplicitField` — one field ok | NEW | Returns field name |
| 6 | `resolveQuietExplicitField` — two fields + quiet → exit 2 | NEW | `CliError` |

Also test via subprocess (section 9) for the full argv → error path.

---

## 8. Error contract

### 8.1 HTTP status mapping

**File:** `src/cli/lib/cli-http-errors.test.ts` — [EXISTS]. Complete.

### 8.2 API client

**File:** `src/cli/lib/api-client.test.ts` — [EXISTS]. Extend:

| # | Test | Status | Assert |
|---|------|--------|--------|
| 1–13 | Existing tests | [EXISTS] | — |
| 14 | `fetchApi` — non-JSON 200 response | NEW | Throws or handles gracefully (verify behavior) |
| 15 | `fetchApi` — response with empty body (not 204) | NEW | Throws or handles gracefully |
| 16 | `fetchApiMutate` — 409 conflict | NEW | `CliError` exitCode 5, code `conflict` |
| 17 | `fetchApiMutate` — 422 validation | NEW | `CliError` exitCode 9, code matches |
| 18 | `fetchApiTrashMutate` — 404 not found | NEW | `CliError` exitCode 3, code `not_found` |

### 8.3 `output.ts` — `printError` / `exitWithError`

**File:** `src/cli/lib/output.test.ts` — [EXISTS]. Complete for current scope.

### 8.4 Write helpers — `resolveExclusiveTextInput`, `parseCliReleaseFlags`

**File:** `src/cli/lib/write/helpers.test.ts` (new)

| # | Test | Assert |
|---|------|--------|
| 1 | `parseCliReleaseFlags` — both `--release` and `--release-id` | Exit 2, `mutually_exclusive_options` |
| 2 | `parseCliReleaseFlags` — `--release none` | Returns `{ mode: "null" }` |
| 3 | `parseCliReleaseFlags` — `--release "v1"` | Returns `{ mode: "name", name: "v1" }` |
| 4 | `parseCliReleaseFlags` — `--release-id "5"` | Returns `{ mode: "id", id: 5 }` |
| 5 | `parseCliReleaseFlags` — `--release-id "abc"` | Exit 2, `invalid_value` |
| 6 | `parseCliReleaseFlags` — neither | Returns `{ mode: "omit" }` |
| 7 | `resolveCliReleaseToApiValue` — mode name, release found | Returns releaseId |
| 8 | `resolveCliReleaseToApiValue` — mode name, not found | Exit 2, `release_not_found_by_name` |
| 9 | `resolveExclusiveTextInput` — flag + file → exit 2 | `conflicting_input_sources` |
| 10 | `resolveExclusiveTextInput` — flag only | Returns `{ source: "flag" }` |
| 11 | `resolveExclusiveTextInput` — none | Returns `undefined` |
| 12 | `parsePositiveInt` — valid | Returns number |
| 13 | `parsePositiveInt` — zero | Exit 2, `invalid_value` |
| 14 | `parsePositiveInt` — non-integer | Exit 2, `invalid_value` |
| 15 | `parseTaskId` — valid | Returns number |
| 16 | `parseTaskId` — invalid | Exit 2 |

---

## 9. Subprocess smoke

Subprocess tests spawn `bun run src/cli/bin/hirotm.ts` as a child process, either against a `Bun.serve` stub server or no server. They catch argv/bootstrap/wiring issues that in-process tests miss.

**File:** `src/cli/subprocess.smoke.test.ts` — [EXISTS], extend.

### 9.1 Existing tests (keep)

| # | Test | Status |
|---|------|--------|
| 1 | `boards list` + stub 200 → exit 0, NDJSON stdout | [EXISTS] |
| 2 | `boards list --format human` → table stdout | [EXISTS] |
| 3 | `boards list --quiet` → slug per line | [EXISTS] |
| 4 | `boards list --quiet --format human` → exit 2 | [EXISTS] |
| 5 | `boards list` + closed port → exit 6, stderr JSON | [EXISTS] |
| 6 | `--help` → exit 0, usage | [EXISTS] |
| 7 | `boards --help`, `query search --help` | [EXISTS] |
| 8 | empty `query search ""` → exit 2 | [EXISTS] |
| 9 | `boards describe` (no arg) → exit 1 | [EXISTS] |
| 10 | `boards delete` without `--yes` → exit 2 | [EXISTS] |
| 11 | `boards delete --yes` + stub → exit 0 | [EXISTS] |
| 12 | `boards list` + stub 403 → exit 4 | [EXISTS] |

### 9.2 New subprocess tests

| # | Test | Stub | Assert |
|---|------|------|--------|
| 13 | `boards list` + stub 401 | Returns 401 JSON `{ error: "unauthenticated", code: "unauthenticated" }` | Exit 10, stderr JSON `code: "unauthenticated"` |
| 14 | `boards list` + stub 404 | Returns 404 JSON | Exit 3, stderr JSON |
| 15 | `boards list` + stub 409 | Returns 409 JSON | Exit 5, stderr JSON |
| 16 | `tasks add` + stub 200 | Stubs POST `/api/boards/b/tasks` → entity JSON | Exit 0, stdout `{ ok: true }` |
| 17 | `lists add` + stub 200 | Stubs POST `/api/boards/b/lists` | Exit 0, stdout envelope |
| 18 | `releases list` + stub 200 | Stubs GET `/api/boards/b/releases` → paginated | Exit 0, NDJSON lines |
| 19 | `statuses list` + stub 200 | Stubs GET `/api/statuses` → array | Exit 0, NDJSON lines |
| 20 | `query search "test" --format human` + stub | Stubs GET `/api/search` → hits | Exit 0, table output contains "Board" header |
| 21 | `tasks list --board b` + stub 200 | Stubs GET `/api/boards/b/tasks` → paginated | Exit 0, NDJSON |
| 22 | `boards list --fields boardId` + stub | Same stub as test 2 | Exit 0, stdout lines only have `boardId` key |
| 23 | `--client-name "Agent"` header check | Stub captures request headers | Header `X-Client-Name` is `"Agent"` |
| 24 | `boards list --format human` + empty result | Stub returns empty page | Stdout contains "No rows." |

---

## 10. Real-stack integration

These tests use the full TaskManager stack: real SQLite database (temp dir), real Hono API server, real `hirotm` subprocess. They are **opt-in** via `RUN_CLI_REAL_STACK=1`.

**File:** `src/cli/subprocess.real-stack.test.ts` — [EXISTS], extend.

### 10.1 Existing tests (keep)

| # | Test | Status |
|---|------|--------|
| 1 | `boards list` → empty DB, NDJSON, exit 0 | [EXISTS] |
| 2 | `statuses list` → seeded rows | [EXISTS] |

### 10.2 New real-stack tests

These tests create data through the CLI (or HTTP API), then read it back to verify round-trip correctness.

| # | Test | Steps | Assert |
|---|------|-------|--------|
| 3 | Board CRUD round-trip | `boards add "Test" --yes` → `boards list` → `boards describe Test` → `boards update Test --name "Updated" --yes` → `boards delete Updated --yes` | Each step exit 0; list includes board; describe shows correct data; delete moves to trash |
| 4 | Task CRUD round-trip | Create board → `lists list` → `tasks add` → `tasks list` → `tasks update` → `tasks move` → `tasks delete --yes` | Each step exit 0; task appears in list; update changes fields; move changes list; delete trashes |
| 5 | List CRUD round-trip | Create board → `lists add` → `lists list` → `lists update` → `lists delete --yes` | Each step exit 0; list appears; update changes name; delete trashes |
| 6 | Release CRUD round-trip | Create board → `releases add --name "v1"` → `releases list` → `releases show` → `releases update --name "v1.1"` → `releases delete --yes` | Each step exit 0 |
| 7 | `query search` against seeded data | Create board + task with title "Searchable" → `query search "Searchable"` | Exit 0, stdout contains hit with matching taskId |
| 8 | Trash restore round-trip | Create board → delete → `trash list boards` → `boards restore <id> --yes` → `boards list` | Board reappears in list |
| 9 | `--format human` output on real data | `boards list --format human` after creating a board | Table output contains board name, no stderr |
| 10 | `--quiet` output on real data | `boards list --quiet` after creating a board | Single line with slug, no JSON |
| 11 | Server unreachable (no server) | Skip `beforeEach` server start; run `boards list -p <dead-port>` | Exit 6, stderr has `server_unreachable` |
| 12 | Error: 403 with restricted CLI policy | Seed board with restrictive `cliPolicy` → attempt write | Exit 4, stderr has `forbidden` (deferred: depends on CLI policy seeding support) |

### 10.3 Real-stack test infrastructure requirements

Each test in this file already uses:
- `mkdtempSync` for isolated data/auth dirs
- `pickEphemeralPort()` for free port
- `integrationPrepareAuth.ts` for API key setup
- `bootstrapDev.ts` as child server process
- `waitForHealth(port, timeout)` before running CLI commands

New tests should reuse this setup. For write tests, the subprocess `hirotm` command is called with `-p <port>`, `--profile <name>`, and appropriate env vars (e.g. `HOME`).

Helper for running CLI and capturing output:

```typescript
async function runHirotm(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", hirotmEntry, ...args, "-p", String(port)],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: rootDir },
  });
  const [stdout, stderr] = await Promise.all([
    readSubprocessStream(proc.stdout),
    readSubprocessStream(proc.stderr),
  ]);
  return { code: await proc.exited, stdout, stderr };
}
```

---

## Appendix A: Test file inventory

| File | Scope | Status |
|------|-------|--------|
| `src/cli/lib/paginatedFetch.test.ts` | Pagination query + fetchAllPages | **NEW** |
| `src/cli/lib/paginatedListRead.test.ts` | Full paginated list read pipeline | **NEW** |
| `src/cli/lib/textTable.test.ts` | Table renderer | **NEW** |
| `src/cli/lib/humanText.test.ts` | Human output formatting | **NEW** |
| `src/cli/lib/cliFormat.test.ts` | Global format state | **NEW** |
| `src/cli/lib/write/helpers.test.ts` | Release flags, text input, id parsing | **NEW** |
| `src/cli/lib/process.test.ts` | Server lifecycle (pid, health, start/stop) | **NEW** |
| `src/cli/lib/testHelpers.ts` | Shared `captureStdout`, `captureStderr` | **NEW** |
| `src/cli/handlers/boards.test.ts` | Board reads: list, describe, tasks | **EXTEND** |
| `src/cli/handlers/lists.test.ts` | List reads | **NEW or EXTEND** |
| `src/cli/handlers/releases.test.ts` | Release reads | **NEW or EXTEND** |
| `src/cli/handlers/statuses.test.ts` | Status reads | **EXTEND** |
| `src/cli/handlers/search.test.ts` | Search reads | **EXTEND** |
| `src/cli/handlers/trash.test.ts` | Trash reads (handler-level) | **EXTEND** |
| `src/cli/handlers/server.test.ts` | Server handlers | [EXISTS] no changes needed |
| `src/cli/lib/api-client.test.ts` | API client edge cases | **EXTEND** |
| `src/cli/lib/command-helpers.test.ts` | Global option validation | **EXTEND** |
| `src/cli/lib/writeCommands.breadth.test.ts` | Write mutations | **EXTEND** |
| `src/cli/lib/writeCommands.smoke.test.ts` | Write smoke | **EXTEND** |
| `src/cli/lib/trashCommands.breadth.test.ts` | Trash mutations | **EXTEND** |
| `src/cli/subprocess.smoke.test.ts` | Subprocess CLI smoke | **EXTEND** |
| `src/cli/subprocess.real-stack.test.ts` | Full-stack integration | **EXTEND** |

---

## Appendix B: Priority order for implementation

Ordered by risk-to-stability impact (highest first):

1. **Shared pipelines** (section 2) — pagination, table renderer, format state. Every read command depends on these.
2. **Write helpers** (section 8.4) — release resolution, text input, id parsing. Every write command depends on these.
3. **Read command handler extensions** (section 3) — human/quiet/fields gaps on existing handlers.
4. **Write command extensions** (section 4) — release flags, body inputs, position flags.
5. **Subprocess smoke extensions** (section 9.2) — additional HTTP status codes, write commands, header checks.
6. **Global option interactions** (section 7) — format/quiet/fields validation edge cases.
7. **Server process tests** (section 6.2) — pid file management, health polling.
8. **API client edge cases** (section 8.2) — non-JSON responses, additional status codes.
9. **Real-stack CRUD round-trips** (section 10.2) — full end-to-end validation.

---

## Appendix C: Conventions

- **Test runner:** `bun:test` exclusively. No Vitest, no Jest.
- **Assertions:** `expect` from `bun:test`. Use `toMatchObject` for partial matching, `toEqual` for exact.
- **Mock pattern for handlers:** Build `CliContext` via `mockContext({ fetchApi: ... })` spreading `createDefaultCliContext()`.
- **Mock pattern for `run*` functions:** Mock `globalThis.fetch`, restore in `afterEach`.
- **Subprocess pattern:** Use `spawnHirotm(args)` helper and `Bun.serve({ port: 0 })` for stub servers.
- **State cleanup:** Always call `resetCliOutputFormat()` in `afterEach` when tests call `syncCliOutputFormatFromGlobals`.
- **Naming:** `describe` block matches function or command name. `test` description states the scenario and expected outcome.
- **No backward compatibility required** (initial development mode).
