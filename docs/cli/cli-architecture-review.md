# CLI Architecture Review — Code Organization & Structural Improvements

**Date:** 2026-04-11
**Scope:** `src/cli/` — all commands, handlers, lib, write layer, output, API client, and their interaction with `src/shared/`.
**Codebase snapshot:** ~10,800 lines across 74 `.ts` files.
**Existing docs:** This report is **new** and separate from `hirotm-vs-building-cli-for-agents-review.md` (feature-level) and `cli-rearchitecture.md` (phase plan). It focuses on **code-level architecture** — duplication, patterns, scaling, and structural health.

**Initial development mode:** no backward compatibility required unless mentioned.

---

## Table of contents

1. [P0 — Unified API client (eliminate triple fetch)](#1-p0--unified-api-client-eliminate-triple-fetch)
2. [P0 — Generic paginated-list handler](#2-p0--generic-paginated-list-handler)
3. [P0 — Unified text-input helpers (body, description, stdin)](#3-p0--unified-text-input-helpers)
4. [P1 — Board-not-found rethrow pattern](#4-p1--board-not-found-rethrow-pattern)
5. [P1 — Constants and magic numbers](#5-p1--constants-and-magic-numbers)
6. [P1 — Module-level mutable globals](#6-p1--module-level-mutable-globals)
7. [P2 — CliContext coverage gap](#7-p2--clicontext-coverage-gap)
8. [P2 — Type organization](#8-p2--type-organization)
9. [P2 — Releases mutation output inconsistency](#9-p2--releases-mutation-output-inconsistency)
10. [P2 — Duplicate positive-int parsers](#10-p2--duplicate-positive-int-parsers)
11. [P3 — Mutual-exclusivity validation boilerplate](#11-p3--mutual-exclusivity-validation-boilerplate)
12. [P3 — Handler fat vs thin inconsistency](#12-p3--handler-fat-vs-thin-inconsistency)
13. [P3 — `canPromptInteractively` duplication](#13-p3--canpromptinteractively-duplication)
14. [P3 — Command registration boilerplate](#14-p3--command-registration-boilerplate)
15. [P3 — Formalize ports/adapters (from cli-rearchitecture.md)](#15-p3--formalize-portsadapters)

---

## 1. P0 — Unified API client (eliminate triple fetch)

### Problem

`api-client.ts` exports **three** near-identical functions:

| Function | Lines | Distinguishing behavior |
|----------|-------|------------------------|
| `fetchApi` | 98–145 | GET, no body, no mutation header |
| `fetchApiMutate` | 147–203 | POST/PATCH/PUT/DELETE, JSON body, mutation-response header |
| `fetchApiTrashMutate` | 209–262 | POST/DELETE, no body, no mutation header |

The **error-handling blocks** (timeout → exit 7, unreachable → exit 6, non-ok → `mapHttpStatusToCliFailure`) are **copy-pasted identically** across all three — 50+ lines of duplicated catch logic. Additionally, `fetchApiMutate` calls `resolveApiKey()` **without** `overrides`, while `fetchApi` calls `resolveApiKey(overrides)` — a latent inconsistency.

### Proposed design

```typescript
type ApiFetchInit = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** When true, sends TASK_MANAGER_MUTATION_RESPONSE_HEADER. */
  mutationEntity?: boolean;
  overrides?: ConfigOverrides;
};

export async function apiFetch<T>(
  endpoint: string,
  init: ApiFetchInit = {},
): Promise<T> {
  // Single implementation: build headers, make request, unified error handling.
}

// Convenience wrappers (one-liners):
export const fetchApi = <T>(ep: string, ov?: ConfigOverrides) =>
  apiFetch<T>(ep, { overrides: ov });

export const fetchApiMutate = <T>(ep: string, init: {...}, ov?: ConfigOverrides) =>
  apiFetch<T>(ep, { method: init.method, body: init.body, mutationEntity: true, overrides: ov });

export const fetchApiTrashMutate = <T>(ep: string, init: {...}, ov?: ConfigOverrides) =>
  apiFetch<T>(ep, { method: init.method, overrides: ov });
```

### Impact

- **~100 lines removed** from duplicated catch blocks.
- Fixes the `resolveApiKey` overrides inconsistency.
- Single place to add retry logic, request logging, or auth refresh in the future.
- Every caller works unchanged (same export signatures as wrappers).

---

## 2. P0 — Generic paginated-list handler

### Problem

The "validate fields → validate quiet → parse limit/offset → single-page or page-all fetch → project → print" dance is **duplicated verbatim** in:

- `handlers/boards.ts` — `handleBoardsList` (~40 lines)
- `handlers/boards.ts` — `handleBoardsTasks` (~40 lines, plus filter params)
- `handlers/search.ts` — `handleSearch` (~35 lines)
- `lib/write/lists.ts` — `runListsList` (~40 lines)
- `lib/write/releases.ts` — `runReleasesList` (~40 lines)
- `lib/trashCommands.ts` — `runTrashBoards`, `runTrashLists`, `runTrashTasks` (~40 lines **each**, ×3)

That's **~315 lines** of near-identical pagination scaffolding spread across **8 call sites**.

### Proposed design

```typescript
// lib/paginatedListRead.ts

type PaginatedListReadSpec<T> = {
  endpoint: string;              // e.g. "/boards" or "/trash/boards"
  extraParams?: URLSearchParams; // filters, board scope, search query, etc.
  fieldAllowlist: readonly string[];
  columns: readonly TableColumn[];
  quietDefaults: readonly string[];
  fetchFn: (url: string) => Promise<PaginatedListBody<T>>;
};

export async function executePaginatedListRead<T>(
  spec: PaginatedListReadSpec<T>,
  options: {
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  // 1. Validate fields, quiet, limit, offset
  // 2. Single-page or page-all fetch
  // 3. Project fields
  // 4. printPaginatedListRead
}
```

Each call site becomes ~10 lines specifying only what differs (endpoint, columns, filters) instead of ~40 lines.

### Impact

- **~250 lines removed** across 8 call sites.
- New features (e.g., cursor pagination, streaming) are added once.
- Column specs, field allowlists, and quiet defaults remain per-entity (no loss of flexibility).
- Reduced surface for bugs when changing pagination behavior.

---

## 3. P0 — Unified text-input helpers

### Problem

Two independent implementations for the same "exclusive flag/file/stdin input" concept:

| Module | Functions | stdin implementation |
|--------|-----------|---------------------|
| `lib/task-body.ts` | `resolveExclusiveBody`, `loadBodyText`, `readStdinUtf8` | `Bun.stdin.stream()` + manual chunking with `Buffer.concat` |
| `lib/write/helpers.ts` | `resolveExclusiveTextInput`, `loadTextInput`, `readStdinUtf8` | `new Response(Bun.stdin.stream()).text()` |

Two `readStdinUtf8()` functions exist with **different implementations** doing the same thing. The exclusive-input logic is structurally identical; only the option names differ (`body/bodyFile/bodyStdin` vs `text/file/stdin`).

### Proposed design

Consolidate into a **single** set of functions in `lib/write/helpers.ts` (or a new `lib/textInput.ts`):

```typescript
export type TextInputSource = "flag" | "file" | "stdin";

export function resolveExclusiveTextInput(
  label: string,
  options: { text?: string; file?: string; stdin?: boolean },
): { source: TextInputSource; text: string } | undefined;

export async function loadTextInput(
  label: string,
  resolved: { source: TextInputSource; text: string },
): Promise<string>;
```

Delete `task-body.ts` entirely. Callers in `write/tasks.ts` map their `body/bodyFile/bodyStdin` options to `{ text, file, stdin }` before calling the shared function.

### Impact

- **~60 lines removed** (entire `task-body.ts`).
- Eliminates two divergent stdin readers (subtle behavior difference risk).
- Single place to add future input sources (e.g., URL fetch, clipboard).

---

## 4. P1 — Board-not-found rethrow pattern

### Problem

This exact try/catch pattern appears in **10+ mutation functions** across `write/boards.ts`, `write/lists.ts`, `write/tasks.ts`, `write/releases.ts`:

```typescript
try {
  const result = await fetchApiMutate<T>(endpoint, { method, body }, { port });
  printJson(writeSuccess(...));
} catch (e) {
  if (e instanceof CliError && e.message === "Board not found") {
    throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
  }
  // sometimes also: "Task not found", "List not found"
  throw e;
}
```

The "enrich CliError with board/entity context" pattern is duplicated because `fetchApiMutate` can't know the board slug (it only sees the URL). Matching on `e.message === "Board not found"` is also **string-fragile**.

### Proposed design

```typescript
// lib/api-client.ts or lib/cli-http-errors.ts

export function enrichNotFoundError(
  error: unknown,
  context: Record<string, unknown>,
): never {
  if (error instanceof CliError && error.details?.code === CLI_ERR.notFound) {
    throw new CliError(error.message, error.exitCode, {
      ...error.details,
      ...context,
    });
  }
  throw error;
}

// Usage:
const result = await fetchApiMutate<T>(endpoint, init, { port })
  .catch((e) => enrichNotFoundError(e, { board: boardId, taskId }));
```

Match on `error.details.code` (stable constant) instead of `error.message` (human string). The utility handles multi-entity enrichment (board + task + list) in one call.

### Impact

- **~80 lines removed** from duplicated try/catch blocks.
- Error matching is stable (code constant, not string).
- Adding new entity types (e.g., "Release not found") is automatic.

---

## 5. P1 — Constants and magic numbers

### Problem

Scattered numeric literals with no central definition:

| Value | Meaning | Locations |
|-------|---------|-----------|
| `120_000` | API fetch timeout (ms) | `api-client.ts` only (good) |
| `8000` | Server start health-check wait (ms) | `process.ts` |
| `500` | Max page limit | `command-helpers.ts` (2×), `trashCommands.ts` (3×), `write/releases.ts` (1×), `handlers/boards.ts` (2×) |
| `250`, `200`, `300` | Polling sleep intervals (ms) | `process.ts` |
| `3001` | Default installed port | `bootstrap/launcher.ts` |
| `20` | Default search page size | `command-helpers.ts` |

The max page limit `500` appears in **8 separate locations** — changing it requires finding all of them.

### Proposed design

```typescript
// lib/constants.ts

export const CLI_DEFAULTS = {
  MAX_PAGE_LIMIT: 500,
  DEFAULT_SEARCH_LIMIT: 20,
  API_FETCH_TIMEOUT_MS: 120_000,
  SERVER_START_WAIT_MS: 8_000,
  INSTALLED_DEFAULT_PORT: 3001,
} as const;

export const CLI_POLLING = {
  HEALTH_INTERVAL_MS: 250,
  FOREGROUND_PROGRESS_MS: 200,
  BACKGROUND_WAIT_MS: 300,
} as const;
```

### Impact

- Change `MAX_PAGE_LIMIT` in one place, affects all 8 locations.
- Self-documenting: new contributors see the full constant surface in one file.
- Easy to find and review during audits.

---

## 6. P1 — Module-level mutable globals

### Problem

Three separate modules maintain mutable module-level state:

| Module | State | Access pattern |
|--------|-------|---------------|
| `cliFormat.ts` | `cliOutputFormat`, `cliQuiet` | get/set/reset functions |
| `clientIdentity.ts` | `runtimeClientName`, `runtimeClientInstanceId` | set/get functions |
| `shared/runtimeConfig.ts` | Selected profile/kind | set/get functions |

This creates:
- **Implicit coupling** — any module can read format/quiet without an import chain that reveals the dependency.
- **Test isolation risk** — `resetCliOutputFormat()` must be called in tests; forgetting it leaks state.
- **No single source of truth** — runtime config is partially in `shared/runtimeConfig`, partially in `cliFormat`, partially in `clientIdentity`.

### Proposed design

Consolidate into a single `CliRuntime` object created once at bootstrap and threaded through the dependency chain:

```typescript
// lib/runtime.ts

export type CliRuntime = {
  readonly outputFormat: CliOutputFormat;
  readonly quiet: boolean;
  readonly clientName: string;
  readonly clientInstanceId: string;
  readonly profile: string;
  readonly runtimeKind: RuntimeKind;
  readonly port: number;
};

export function createCliRuntime(argv: string[]): CliRuntime { ... }
```

Extend `CliContext` to include `runtime: CliRuntime`. Output functions accept runtime as a parameter (or access it from context).

**Incremental path:** Keep getters initially but add a `CliRuntime` aggregate that wraps them, and gradually migrate consumers.

### Impact

- Eliminates hidden global state coupling.
- Tests create isolated runtime instances (no `reset*()` calls needed).
- All runtime decisions (format, quiet, profile, port) visible in one type.
- Prerequisite for supporting concurrent CLI contexts (e.g., testing, programmatic usage).

---

## 7. P2 — CliContext coverage gap

### Problem

`CliContext` currently exposes: `resolvePort`, `resolveDataDir`, `fetchApi`, `printJson`, `startServer`, `stopServer`, `readServerStatus`.

However, most mutation code in `lib/write/*.ts` **bypasses context entirely** — it imports `fetchApiMutate`, `fetchApiTrashMutate`, `printJson`, and `CliError` directly from their modules. The `trashCommands.ts` module imports `fetchApi` directly (not from context).

This means:
- **Tests cannot intercept mutations** via `CliContext` fakes.
- **Two access patterns** coexist: context-injected reads vs direct-import writes.
- Adding cross-cutting concerns to API calls (logging, retries) requires touching every import site.

### Proposed design

Add `fetchApiMutate` and `fetchApiTrashMutate` to `CliContext`. Thread `ctx` into `lib/write/*.ts` and `lib/trashCommands.ts` functions.

```typescript
export type CliContext = {
  resolvePort: (overrides?: ConfigOverrides) => number;
  resolveDataDir: (overrides?: ConfigOverrides) => string;
  fetchApi: typeof fetchApi;
  fetchApiMutate: typeof fetchApiMutate;
  fetchApiTrashMutate: typeof fetchApiTrashMutate;
  printJson: typeof printJson;
  startServer: typeof startServer;
  stopServer: typeof stopServer;
  readServerStatus: typeof readServerStatus;
};
```

All `runXxx` functions receive `ctx` as their first parameter.

### Impact

- Mutation tests can use fakes/spies for API calls.
- Consistent access pattern across all CLI code.
- Cross-cutting concerns (logging, retry, auth refresh) added in one place.
- Prerequisite for the formal ports/adapters layer.

---

## 8. P2 — Type organization

### Problem

CLI types are scattered without a clear convention:

| Type | Location |
|------|----------|
| `CliContext` | `handlers/context.ts` |
| `CliError` | `lib/output.ts` |
| `CliOutputFormat` | `lib/cliFormat.ts` |
| `QuietListPlan` | `lib/output.ts` |
| `TableColumn` | `lib/textTable.ts` |
| `ServerStatus` | `lib/process.ts` |
| `BodySource` | `lib/task-body.ts` |
| `TextInputSource` | `lib/write/helpers.ts` |
| `ConfirmMutableActionArgs` | `lib/mutableActionConfirm.ts` |
| `ConfigOverrides` | `lib/config.ts` |
| Commander option types | Inline in `commands/*.ts` action signatures |

There is **no** `src/cli/types/` directory. Types live next to their implementation, which is fine for internal types but problematic for:
- Types used across multiple modules (`ConfigOverrides` used everywhere).
- Types that form the CLI's **public contract** (`CliError`, `CliContext`, exit codes).

### Proposed design

Create `src/cli/types/` with clear boundaries:

```
src/cli/types/
  context.ts      — CliContext, CliRuntime
  errors.ts       — CliError, CLI_ERR, exit code types
  output.ts       — CliOutputFormat, QuietListPlan, TableColumn
  config.ts       — ConfigOverrides, ServerStatus
  options.ts      — Shared option type interfaces (PaginatedListOptions, etc.)
```

Implementation files import types from `types/`; this creates a clear dependency direction.

### Impact

- New contributors find types quickly.
- Clear distinction between public and internal types.
- Avoids circular imports between implementation modules.
- Option type interfaces can be shared between `commands/*.ts` and `handlers/*.ts`.

---

## 9. P2 — Releases mutation output inconsistency

### Problem

Release add/update outputs **raw API response** objects:

```typescript
// write/releases.ts — runReleasesAdd
const created = await fetchApiMutate<ReleaseDefinition>(...);
printJson(created);  // ← raw entity, no writeSuccess envelope
```

Every other domain (boards, lists, tasks) uses the standardized envelope:

```typescript
printJson(writeSuccess(
  { boardId, slug, updatedAt },
  compactEntity(entity),
));
```

This means agents parsing release mutations get a different shape than all other mutations.

### Proposed design

Define `compactReleaseEntity()` in `write-result.ts` and wrap release mutations in the standard envelope. If the release mutation API doesn't return `boardId` / `boardSlug` / `boardUpdatedAt`, either adjust the API or fetch the board after the mutation (as done for trash restore).

### Impact

- Consistent mutation output contract for agents.
- No special-casing in agent scripts.
- Small change (~20 lines).

---

## 10. P2 — Duplicate positive-int parsers

### Problem

Two identical functions:

```typescript
// lib/write/helpers.ts
export function parsePositiveInt(label: string, raw: string | undefined): number | undefined

// lib/trashCommands.ts
function parsePositiveIntLabel(label: string, raw: string | undefined): number | undefined
```

Same signature, same logic, same error handling. `parsePositiveIntLabel` is a private copy.

### Proposed design

Delete `parsePositiveIntLabel` from `trashCommands.ts`. Import `parsePositiveInt` from `lib/write/helpers.ts` (or move it to a shared `lib/parsers.ts`).

### Impact

- Trivial (~15 lines removed).
- Eliminates divergence risk.

---

## 11. P3 — Mutual-exclusivity validation boilerplate

### Problem

The pattern for validating mutually exclusive options is repeated with small variations across many write functions:

```typescript
if (opts.clearEmoji && opts.emoji !== undefined) {
  throw new CliError("Cannot use --emoji together with --clear-emoji", 2, {
    code: CLI_ERR.mutuallyExclusiveOptions,
  });
}
if (opts.clearColor && opts.color !== undefined) {
  throw new CliError("Cannot use --color together with --clear-color", 2, {
    code: CLI_ERR.mutuallyExclusiveOptions,
  });
}
```

This appears in `write/boards.ts` (3×), `write/lists.ts` (2×), `write/tasks.ts` (2×), `write/releases.ts` (2×).

### Proposed design

```typescript
// lib/validation.ts

export function assertMutuallyExclusive(
  pairs: Array<[string, unknown, string, unknown]>,
): void {
  for (const [flagA, valueA, flagB, valueB] of pairs) {
    if (valueA !== undefined && valueB) {
      throw new CliError(
        `Cannot use ${flagA} together with ${flagB}`,
        2,
        { code: CLI_ERR.mutuallyExclusiveOptions },
      );
    }
  }
}

// Usage:
assertMutuallyExclusive([
  ["--emoji", opts.emoji, "--clear-emoji", opts.clearEmoji],
  ["--color", opts.color, "--clear-color", opts.clearColor],
]);
```

### Impact

- **~40 lines removed** across write modules.
- Consistent error messages.
- Adding new clear/set pairs is one line.

---

## 12. P3 — Handler fat vs thin inconsistency

### Problem

Two structural patterns coexist for handlers:

**Fat handlers** (`handlers/boards.ts`, `handlers/search.ts`, `handlers/statuses.ts`):
- Contain HTTP fetch logic, pagination, field projection, and output directly.
- Import `ctx.fetchApi` and call it inline.

**Thin handlers** (`handlers/tasks.ts`, `handlers/lists.ts`, `handlers/releases.ts`, `handlers/trash.ts`):
- Immediately delegate to `lib/write/*.ts` or `lib/trashCommands.ts`.
- Handler is a ~5-line function that resolves port and calls `runXxx(...)`.

This inconsistency means:
- Read operations (boards list, tasks list, search) live at a different layer than write operations.
- `handlers/boards.ts` is **386 lines** (the largest handler) because it contains both read logic and write delegation.
- Finding "where does boards list happen" vs "where does boards add happen" requires knowing the split convention.

### Proposed design

Choose one pattern. Recommended: **all list/read operations use `lib/` functions** (consistent with writes):

- Move `handleBoardsList` logic into `lib/read/boards.ts` → `runBoardsList(...)`.
- Move `handleBoardsTasks` logic into `lib/read/tasks.ts` → `runBoardsTasksList(...)`.
- Move `handleSearch` logic into `lib/read/search.ts` → `runSearch(...)`.
- Handlers become uniformly thin: resolve port, delegate to `lib/read/*` or `lib/write/*`.

Alternative: **all operations live in handlers** (move `lib/write/*` inline). Less recommended because it makes handlers large and harder to test.

### Impact

- Consistent architecture: commands → handlers (thin) → lib (logic).
- `handlers/boards.ts` shrinks from 386 to ~100 lines.
- Clear file-level separation: `lib/read/` for list operations, `lib/write/` for mutations.
- New commands follow an obvious pattern.

---

## 13. P3 — `canPromptInteractively` duplication

### Problem

```typescript
// bootstrap/launcher.ts
function canPromptInteractively(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// lib/mutableActionConfirm.ts
function canPromptInteractively(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
```

Identical private functions in two modules.

### Proposed design

Export from one location (e.g., `lib/tty.ts` or `lib/mutableActionConfirm.ts`) and import in both.

### Impact

- Trivial (~5 lines).
- Prevents future divergence.

---

## 14. P3 — Command registration boilerplate

### Problem

Every `commands/*.ts` file follows the same pattern:

1. Create subcommand.
2. Add options with `addPortOption(...)`.
3. Define action with `async (options) => { await withCliErrors(() => handler(ctx, ...)) }`.

The `addPortOption` call chains are inconsistent — sometimes wrapping the command, sometimes called separately. The inline `async (options) => { await withCliErrors(() => ...) }` wrapper is repeated in every action.

### Proposed design

Create a helper that combines the common action wrapper:

```typescript
// lib/command-helpers.ts

export function cliAction(
  fn: (...args: unknown[]) => Promise<void>,
): (...args: unknown[]) => Promise<void> {
  return (...args) => withCliErrors(() => fn(...args));
}
```

And standardize option attachment order:

```typescript
tasksCommand
  .command("list")
  .description("...")
  .requiredOption(...)
  .option(...)
  .withPort()           // if using Commander extension
  .action(cliAction((options) => handleTasksList(ctx, options)));
```

### Impact

- Reduces per-action boilerplate.
- Ensures consistent error wrapping (can't forget `withCliErrors`).
- Lower priority because the current pattern works and is well-understood.

---

## 15. P3 — Formalize ports/adapters

### Problem

`cli-rearchitecture.md` describes a target architecture with `ports/` (interfaces) and `adapters/` (implementations) that was deferred after Phase 3. Currently, `CliContext` serves as a partial substitute, but:

- `CliContext` is a plain type, not an interface with swappable implementations.
- Most write/trash code bypasses `CliContext` entirely (see item 7).
- Output, process management, and config are directly imported, not injected.

### Proposed design

Implement the ports/adapters layer described in `cli-rearchitecture.md`:

```
ports/
  api.ts        — ApiPort interface (fetch, mutate, health)
  output.ts     — OutputPort interface (printJson, printError, printTable)
  process.ts    — ProcessPort interface (startServer, stopServer, readStatus)

adapters/
  http-api.ts   — implements ApiPort using fetch + shared config
  node-output.ts — implements OutputPort using process.stdout/stderr
  node-process.ts — implements ProcessPort using Bun.spawn + PID files
```

`CliContext` becomes the composition root that wires adapters to ports.

### Impact

- Full testability: unit tests use fake ports, integration tests use real adapters.
- Clear dependency boundaries enforced by types.
- Prerequisite for multi-runtime support (e.g., Deno, Node without Bun).
- Lowest priority because the current `CliContext` approach is functional.

---

## Summary matrix

| # | Issue | Priority | Lines saved | Files touched | Risk |
|---|-------|----------|-------------|---------------|------|
| 1 | Unified API client | **P0** | ~100 | 1 (+ update imports) | Low |
| 2 | Generic paginated-list read | **P0** | ~250 | 8 | Medium |
| 3 | Unified text-input helpers | **P0** | ~60 | 3 | Low |
| 4 | Board-not-found rethrow | **P1** | ~80 | 5 | Low |
| 5 | Constants file | **P1** | 0 (clarity) | 8 | Low |
| 6 | Mutable globals → CliRuntime | **P1** | 0 (architecture) | ~15 | Medium |
| 7 | CliContext coverage (mutations) | **P2** | 0 (testability) | ~12 | Medium |
| 8 | Type organization | **P2** | 0 (clarity) | ~20 | Low |
| 9 | Releases output consistency | **P2** | 0 (contract) | 2 | Low |
| 10 | Duplicate parsePositiveInt | **P2** | ~15 | 2 | Low |
| 11 | Mutual-exclusivity helper | **P3** | ~40 | 5 | Low |
| 12 | Fat/thin handler consistency | **P3** | 0 (architecture) | ~8 | Medium |
| 13 | canPromptInteractively dup | **P3** | ~5 | 2 | Low |
| 14 | Command registration helper | **P3** | ~30 | 8 | Low |
| 15 | Formal ports/adapters | **P3** | 0 (architecture) | ~20 | High |

### Recommended execution order

**Phase A** (highest ROI, safe): Items 1, 3, 5, 10, 13 — mechanical dedup, low risk.
**Phase B** (structural improvement): Items 2, 4, 11 — shared abstractions that reduce future feature cost.
**Phase C** (architecture evolution): Items 6, 7, 8, 9, 12 — context threading, type reorg, consistency.
**Phase D** (aspirational): Items 14, 15 — ergonomic and formal architecture (do when the team is ready for a larger refactor).

---

## What's already good

- **Clean layering**: CLI → shared → server with no circular deps.
- **Commander at the edge**: Command definitions are separated from logic.
- **CliContext exists**: Even if incomplete, the DI direction is established.
- **Error codes are comprehensive**: `CLI_ERR` covers the full spectrum.
- **Exit code contract**: Well-defined mapping from HTTP status to exit codes.
- **Output format system**: `ndjson` / `human` / `--quiet` is well-designed.
- **Write envelopes**: `writeSuccess` / `writeTrashMove` provide consistent agent-friendly output.
- **Test infrastructure**: `CliContext` fakes, smoke tests, and breadth tests exist.
- **No CLI↔server compile-time coupling**: Server is spawned dynamically, not imported.
