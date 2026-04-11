# Board releases — technical design

**Related documents**

- [Releases requirements](./releases-requirements.md) — product rules and scope.
- [Releases plan](./releases-plan.md) — phased delivery.

This document proposes storage, API, shared types, filtering, keyboard handling, CLI, and sync considerations for **Release**.

## Design summary

- Add a **board-scoped releases** table and a **nullable foreign key** on tasks (`release_id`).
- Extend **`Board`** payloads with `releases: ReleaseDefinition[]` (or equivalent) and board-level settings: `defaultReleaseId`, `autoAssignReleaseOnCreateUi`, `autoAssignReleaseOnCreateCli` (exact names TBD in implementation).
- Apply **auto-assign** in the **server** on task **create** when the client omits an explicit release and the matching toggle is on; use **`createdByPrincipal`** (`web` vs `cli`) already present on tasks to decide UI vs CLI behavior—no new “channel” field required if create endpoints set it consistently.
- Extend **shared board filter** helpers (`boardFilters.ts` pattern) with **active release ids** + **untagged** flag, and **OR** semantics consistent with group/priority.
- **CLI** resolves `--release <name>` to id server-side or in CLI after `boards describe` / `releases list`; storage remains id-based.

## Data model

### `release` (table name TBD; e.g. `board_release`)

| Column        | Type        | Notes |
|---------------|-------------|--------|
| `id`          | integer PK  | |
| `board_id`    | FK → board  | |
| `name`        | text        | **Unique** per `board_id` |
| `color`       | nullable    | Same representation as task/priority colors (align with existing `task_priority` / theme tokens). |
| `release_date`| nullable date or ISO string | Optional metadata; display-only for v1 unless filtered. |
| `created_at`  | timestamp   | Ordering for lists. |

### `task`

| Column       | Type        | Notes |
|--------------|-------------|--------|
| `release_id` | nullable FK → `release.id` | **null** = untagged. |

### Board settings (columns or JSON — follow existing board prefs patterns)

- `default_release_id` — nullable FK.
- `auto_assign_release_ui` — boolean; **false** when `default_release_id` is null (enforced in API).
- `auto_assign_release_cli` — boolean; same.

Indexes: `(board_id)` on releases; `(board_id, name)` unique; `(release_id)` on tasks for delete/move operations.

## API surface (illustrative)

### Releases CRUD

- `GET /api/boards/:boardId/releases` — list releases for board (or embed in full board load).
- `POST /api/boards/:boardId/releases` — create (name required; color, date optional).
- `PATCH /api/releases/:id` — rename, color, date.
- `DELETE /api/releases/:id` — with query/body option to **reassign** tasks to another `releaseId` or **clear** (untagged), mirroring task group deletion semantics.

### Board patch

- Patch board to set `defaultReleaseId`, `autoAssignReleaseOnCreateUi`, `autoAssignReleaseOnCreateCli` with validation: toggles **false** or **ignored** when no default.

### Task create / update

- **Create:** Body may include `releaseId: number | null`.  
  - If `releaseId` is **omitted** (or treated as “use board rules” per agreed contract): when `defaultReleaseId` is set **and** the relevant auto-assign flag matches **`createdByPrincipal`** for this request, set `release_id` to default.  
  - If `releaseId: null` **explicitly**: **never** apply auto-assign (untagged).
- **Update:** `PATCH` task with `releaseId` optional; explicit null clears release.

**Explicit null vs omit:** The requirements demand a clear rule—recommend: **omit** = apply auto-assign on create only when flags say so; **null** = force untagged. If JSON merge makes “omit” hard, use a dedicated flag or separate endpoint contract documented in OpenAPI/types.

### Shared types (`src/shared/models.ts`)

- `ReleaseDefinition` — id, boardId, name, color?, releaseDate?, createdAt.
- `Task` — `releaseId: number | null` (or optional with null meaning untagged).
- `Board` — `releases`, `defaultReleaseId`, `autoAssignReleaseOnCreateUi`, `autoAssignReleaseOnCreateCli`.

Denormalization: API may return **`release`** summary on each task `{ id, name, color? }`** for list rendering without N+1 lookups, or clients resolve via `board.releases`—choose one pattern and stick to it for cache invalidation.

## Filtering

Extend the normalized filter shape used by `taskMatchesBoardFilter` (see `boardFilters.ts`):

```ts
/** null = all releases; OR across ids; untagged via sentinel or parallel flag. */
export type ActiveReleaseFilter =
  | null
  | { kind: "or"; releaseIds: number[]; includeUntagged: boolean };
```

Alternatively mirror **priority** style: `number[] | null` for ids plus a **boolean `includeUntagged`** when any id set is active—exact shape should stay consistent with URL serialization in `repeatedSearchParams` / preferences store.

**Predicate:**

- `null` → no release filter.
- Otherwise task matches if **`includeUntagged && task.releaseId == null`** OR **`task.releaseId` in `releaseIds`**.

**Stats:** If board statistics include filtered counts, extend the stats filter payload to include release (per requirements for other dimensions).

## Keyboard

- Register **`e`** in `boardShortcutRegistry.ts` when a task is focused / selected; handler reads board default release id and issues the same mutation as the task editor would (set release to default, **overwrite**).

**Conflict check:** Ensure **`e`** does not collide with existing bindings in the same context; document in shortcuts help.

## CLI (`hirotm`)

- **`hirotm releases list|show|add|update|delete`** (exact verbs aligned with task groups CLI policy).
- **`hirotm tasks add`** — `--release <name>`; optional **`--release-id <id>`** for scripts; **`--release none`** for untagged and to **opt out** of CLI auto-assign when the board would otherwise apply default.
- **`hirotm tasks update`** — same flags.
- **List/filter commands** that already take board filters — add **release** dimension consistent with web (multi-select OR + untagged); **not** added to `search` for v1.

Permissions: extend **`BoardCliPolicy`** (or add `releases` section) parallel to task group management—see existing CLI policy for groups.

## Multi-writer sync

**Conflict model:** The server is the source of truth; persisted writes are last-write-wins per row. The web client does not merge conflicting task bodies or show a conflict UI.

**SSE (implemented):**

- **`task-created` / `task-updated`** — payload includes `taskId` and `boardUpdatedAt`. The client refetches that task via `GET /api/boards/:boardId/tasks/:taskId`, which includes `releaseId`, then invalidates the full board query so the cache converges with other writers (CLI, second tab).
- **`release-upserted`** — after `POST`/`PATCH` `/api/boards/:id/releases`, the server emits `{ kind: "release-upserted", release, boardUpdatedAt }`. Open tabs merge `release` into `board.releases` (same sort as `listReleasesForBoard`) and bump `board.updatedAt`, without refetching the entire board payload. Stats queries for that board are invalidated.
- **`DELETE` release** — still emits **`board-changed`** (full board invalidation) because tasks may be bulk-cleared or reassigned and board default/auto-assign flags may change.

Stale guards use strict `boardUpdatedAt` ordering (see `useBoardChangeStream`).

**Payload size:** The full board document includes `releases[]`. For typical release counts this is acceptable; lazy-loading releases is deferred until measured need.

## Migrations

- Add table + nullable `task.release_id`.
- Backfill: none (all null).

## Testing notes

- Unique name per board (DB + API).
- Auto-assign: UI principal vs CLI principal; explicit null override.
- Delete release: tasks cleared or moved per chosen UX.
- Filter OR + untagged combinations; empty = all.
