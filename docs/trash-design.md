# Trash design

**Related documents**

- [Trash requirements](./trash-requirements.md) — product rules and scope for Trash.
- [Board statistics design](./board-stats-design.md) — existing canonical stats model that Trash must preserve.
- [Notifications design](./notifications-design.md) — notification/event architecture that Trash must integrate with.
- [Multi-writer sync design](./multi-writer-sync-design.md) — open-page convergence model that Trash must continue to use.
- [hirotm CLI — Design Document](./ai-cli-design.md) — current CLI and HTTP/API assumptions.

This document describes the target technical design for implementing Trash using a **no-cascade soft delete** model.

## Design summary

- Add `deleted_at` to `board`, `list`, and `task`.
- Do **not** soft-delete descendants when a parent is trashed.
- Treat live visibility as a derived property based on the entity plus its ancestors.
- Keep normal board/list/task routes scoped to **active** entities only.
- Add a dedicated Trash read/write surface for explicit trash entries.
- Keep FTS search, board stats, filters, and existing board views operating on the active set only.
- Keep hard database cascade for **permanent delete** only.
- Extend `hirotm` so delete means "move to trash", and restore/purge become explicit commands.

## Why no-cascade is the chosen model

This design intentionally stores only direct user intent:

- if the user trashes a task, the task row records that fact
- if the user trashes a list, only the list row records that fact
- if the user trashes a board, only the board row records that fact

Child visibility is then derived from the hierarchy:

- a task disappears if the task is trashed, or its list is trashed, or its board is trashed
- a list disappears if the list is trashed, or its board is trashed

That gives the desired restore semantics without extra provenance columns:

1. Trash task `T`
2. Trash list `L`
3. Restore list `L`

Result:

- `L` returns
- `T` stays trashed, because `T.deleted_at` is still set

This avoids soft-cascade ambiguity and avoids parallel trash-table restore complexity.

## Current architecture and impact points

### Storage and board loading

Today the main live read model is concentrated in:

- `src/server/storage/board.ts`
  - `readBoardIndex()`
  - `entryByIdOrSlug()`
  - `loadBoard()`
- `src/server/storage/lists.ts`
  - `readListById()`
  - `deleteListOnBoard()`
- `src/server/storage/tasks.ts`
  - `readTaskById()`
  - `deleteTaskOnBoard()`
- `src/server/storage/search.ts`
  - `searchTasks()`

This is good news: active-vs-trash behavior can be centralized in a small number of storage functions instead of spread across the entire client.

### Board stats and filters

Board stats already compute from the loaded `Board` object, not from a separate aggregate table. That means once `loadBoard()` returns only active lists/tasks, board stats and most filters remain correct automatically.

### Search

FTS currently indexes task text into `task_search`, then joins back to `task`, `list`, and `board` during reads. That means Trash can be enforced at query time without redesigning the FTS table.

### CLI

`hirotm` already has resource-scoped delete commands:

- `boards delete`
- `lists delete`
- `tasks delete`

Those commands can keep their names while changing semantics from hard delete to move-to-trash.

## Data model

### New columns

Add nullable `deleted_at TEXT` to:

- `board`
- `list`
- `task`

Do **not** add Trash columns to:

- `task_group`
- `task_priority`
- `board_view_prefs`
- `board_cli_policy`

Reason:

- these entities are not independently trashed in this feature
- they stay attached to the board row while the board is trashed
- existing hard-delete cascade already cleans them up on permanent board delete

### Recommended indexes

Add indexes that support both live reads and trash-page reads.

Recommended minimum:

- `board(deleted_at, name, id)`
- `list(board_id, deleted_at, sort_order, id)`
- `task(board_id, deleted_at, list_id, status_id, sort_order, id)`
- optional trash-page helpers:
  - `list(deleted_at, board_id, id)`
  - `task(deleted_at, board_id, list_id, id)`

SQLite partial indexes are also a good fit here, especially for active reads:

- active boards: `WHERE deleted_at IS NULL`
- active lists: `WHERE deleted_at IS NULL`
- active tasks: `WHERE deleted_at IS NULL`

Exact index tuning can be measured during implementation, but the design should assume active reads remain hot and trash reads remain secondary.

## Canonical state model

### Explicit trash

- Board explicit trash: `board.deleted_at IS NOT NULL`
- List explicit trash: `list.deleted_at IS NOT NULL`
- Task explicit trash: `task.deleted_at IS NOT NULL`

### Effective trash

- Board effectively trashed: same as explicit trash
- List effectively trashed: `list.deleted_at IS NOT NULL OR board.deleted_at IS NOT NULL`
- Task effectively trashed:
  - `task.deleted_at IS NOT NULL`
  - or `list.deleted_at IS NOT NULL`
  - or `board.deleted_at IS NOT NULL`

### Active

- Active board: `board.deleted_at IS NULL`
- Active list: `list.deleted_at IS NULL AND board.deleted_at IS NULL`
- Active task:
  - `task.deleted_at IS NULL`
  - and `list.deleted_at IS NULL`
  - and `board.deleted_at IS NULL`

These definitions should be treated as canonical and reused throughout storage and API code.

## Query model

The most important design rule is:

**Normal application reads default to active scope. Trash is opt-in.**

### Recommended storage helper strategy

Split helper intent clearly instead of overloading "exists" helpers.

Recommended helper families:

- raw existence / raw lookup
  - row exists regardless of trash state
- active lookup
  - entity is readable in live surfaces
- explicit-trash lookup
  - entity appears in Trash surfaces

Examples:

- `boardRowExists(boardId)` instead of current `boardExists()`
- `readActiveBoardEntryByIdOrSlug()`
- `readActiveListById()`
- `readActiveTaskById()`
- `readTrashedBoards()`
- `readTrashedLists()`
- `readTrashedTasks()`

This is preferable to sprinkling ad hoc `deleted_at` predicates through route handlers.

### Board index

`readBoardIndex()` should return active boards only.

Effect:

- sidebar excludes trashed boards
- home redirect excludes trashed boards
- `useBoards()` remains the live board list

### Board lookup and board detail

`entryByIdOrSlug()` and `loadBoard()` should default to active boards only.

Effect:

- `/api/boards/:id` treats trashed boards as unavailable in the live app
- board-scoped live routes naturally stop working once the board is trashed
- live task/list reads continue to rely on the active board model

For live routes, returning `404` for trashed entities is the simplest model. The live app should treat them as not found rather than introducing a second visible state into every existing route.

### Board load contents

`loadBoard(boardId)` should:

- read only active boards
- read only active lists on that board
- read only active tasks on active lists for that board

Because board-level routes such as `GET /api/boards/:id/tasks` already derive from `loadBoard()`, this keeps task filters and list ordering aligned with the active model automatically.

### List and task direct reads

`readListById()` and `readTaskById()` should become active readers.

That means:

- trashed list/task rows are not returned from live routes
- list/task rows hidden by a trashed parent are also not returned from live routes

Trash-specific routes should use separate explicit-trash readers rather than flags on the live readers.

## Trash read model

Trash surfaces should show **explicitly trashed** entries only.

That means:

- Boards tab shows boards where `board.deleted_at IS NOT NULL`
- Lists tab shows lists where `list.deleted_at IS NOT NULL`
- Tasks tab shows tasks where `task.deleted_at IS NOT NULL`

Do **not** surface effective-only descendants as separate trash rows. Example:

- if a board is trashed but its lists are not explicitly trashed, the board appears in Trash
- those lists do not appear as separate trash rows just because the board is trashed

### Trash row context

Trash rows should include enough information to support restore/purge UX:

- entity id
- display name / title / emoji where relevant
- `deletedAt`
- parent board id/name for lists and tasks
- parent list id/name for tasks
- booleans or derived fields indicating whether restore is currently blocked by a trashed parent

### Recommended server response shapes

This does not have to be the final TypeScript shape, but the server should return one stable Trash read model per tab.

Example:

```ts
interface TrashedBoardItem {
  type: "board";
  id: number;
  name: string;
  slug: string;
  emoji: string | null;
  deletedAt: string;
}

interface TrashedListItem {
  type: "list";
  id: number;
  name: string;
  emoji: string | null;
  boardId: number;
  boardName: string;
  boardDeletedAt: string | null;
  deletedAt: string;
  canRestore: boolean;
}

interface TrashedTaskItem {
  type: "task";
  id: number;
  title: string;
  emoji: string | null;
  boardId: number;
  boardName: string;
  boardDeletedAt: string | null;
  listId: number;
  listName: string;
  listDeletedAt: string | null;
  deletedAt: string;
  canRestore: boolean;
}
```

## API model

### Keep delete endpoints, change semantics

To minimize churn across browser and CLI callers, keep the current delete route shapes but change their meaning:

- `DELETE /api/boards/:id` -> move board to Trash
- `DELETE /api/boards/:id/lists/:listId` -> move list to Trash
- `DELETE /api/boards/:id/tasks/:taskId` -> move task to Trash

These routes should:

- set the entity's `deleted_at`
- bump the owning board's `updated_at` for board/list/task trash and restore operations
- publish sync/notification events
- return a response describing the trash action

### Add dedicated Trash endpoints

Recommended route family:

```txt
GET    /api/trash/boards
GET    /api/trash/lists
GET    /api/trash/tasks
POST   /api/trash/boards/:id/restore
POST   /api/trash/lists/:id/restore
POST   /api/trash/tasks/:id/restore
DELETE /api/trash/boards/:id
DELETE /api/trash/lists/:id
DELETE /api/trash/tasks/:id
```

Interpretation:

- `GET /api/trash/*` returns explicit trash rows for the corresponding tab
- `POST /restore` restores the trashed entity
- `DELETE /api/trash/*/:id` permanently deletes the trashed entity

The Trash API should remain explicit rather than overloading query flags onto live routes.

### Restore semantics

Restore rules:

- restore board:
  - require board row exists and is explicitly trashed
  - clear `board.deleted_at`
- restore list:
  - require list row exists and is explicitly trashed
  - require parent board is active
  - clear `list.deleted_at`
- restore task:
  - require task row exists and is explicitly trashed
  - require parent board is active
  - require parent list is active
  - clear `task.deleted_at`

Blocked restore should return `409 Conflict`, not silently succeed.

### Permanent delete semantics

Permanent delete rules:

- purge board:
  - require board row exists and is explicitly trashed
  - hard-delete board row
  - existing FK cascade removes dependent lists, tasks, groups, priorities, prefs, and policy rows
- purge list:
  - require list row exists and is explicitly trashed
  - hard-delete list row
  - existing FK cascade removes tasks in that list
- purge task:
  - require task row exists and is explicitly trashed
  - hard-delete task row

Permanent delete should be allowed even if ancestors are trashed, as long as the target itself is explicitly trashed.

## Board loading, filtering, and statistics

### Board page

The live board page should continue to consume a `Board` that contains only active lists/tasks.

That means no board-page component should need first-class Trash awareness for normal rendering.

### Board task listing endpoint

`GET /api/boards/:id/tasks` already filters from `loadBoard()`. Once `loadBoard()` returns only active data:

- existing list/status/group/priority/date filters continue to work
- hidden-by-trash tasks never enter the filter pipeline
- CLI `boards tasks` output stays aligned automatically

### Board statistics

Board stats should not need a new Trash-specific counting model.

Because `computeBoardStats()` operates on the active board object, stats stay correct once `loadBoard()` excludes effectively trashed data.

Implications:

- board `L` counts ignore trashed lists
- board/list `T / O / C` counts ignore effectively trashed tasks
- no new stats API semantics are required beyond active-board loading

### Filtering

Existing board filters remain unchanged in meaning:

- they narrow the active task set
- they do not need a separate "exclude trashed" option

Trash filtering is a separate concern that belongs on Trash surfaces, not in the live board filter model.

## FTS search design

### Keep the existing `task_search` table

Do not move trashed tasks to a separate FTS index and do not delete FTS rows when an entity is merely moved to Trash.

Reason:

- task text still exists and should remain restorable without re-indexing
- list/group/status rename triggers should continue keeping indexed text up to date
- the live search result set can be controlled by joins/predicates at read time

### Live search behavior

`searchTasks()` should exclude effectively trashed tasks by joining back to live rows:

- board must be active
- list must be active
- task must be active

Concretely, the search query should enforce:

- `b.deleted_at IS NULL`
- `l.deleted_at IS NULL`
- `t.deleted_at IS NULL`

This preserves current search UX:

- normal search searches live work only
- trashed entities do not pollute normal search results

### Trash search

Dedicated FTS search inside Trash is not required for v1.

If needed later, the same `task_search` index can support trash-task search by reversing the active predicate on the joined tables.

## Notifications and live sync

### Notifications

Current delete notifications should be renamed semantically:

- `board.deleted` -> `board.trashed`
- `list.deleted` -> `list.trashed`
- `task.deleted` -> `task.trashed`

Add:

- `board.restored`
- `list.restored`
- `task.restored`
- optional but recommended:
  - `board.permanently_deleted`
  - `list.permanently_deleted`
  - `task.permanently_deleted`

This keeps historical notification wording truthful.

### SSE / board events

The current board event model can support Trash with either:

1. richer event names such as `task-trashed` / `task-restored`
2. broader invalidation using `board-changed`

Recommended approach:

- use explicit `*-trashed` and `*-restored` event kinds for list/task actions that change live board contents
- keep `board-changed` for board trash/restore/purge, because the page usually just needs to refetch or redirect

The client should treat these events as invalidation triggers, not as complete state patches.

### Open board while board is trashed

If the currently open board becomes trashed:

- the board detail query should become unavailable from the live API
- the client should redirect away from the board page
- recommended destination: `/trash` rather than the home board redirect

This is especially important for external writes arriving through SSE.

## Client design

### Routing

Add a new top-level route:

- `/trash`

App routing changes are required in:

- `src/client/App.tsx`
- `src/client/components/layout/Sidebar.tsx`

### Sidebar

Sidebar changes:

- add a Trash nav item
- continue listing only active boards
- if the selected board is trashed, navigation should move away from that board

### Trash page

Recommended v1 layout:

- one page
- tabs: Boards, Lists, Tasks
- each tab shows explicit trash items ordered by newest `deletedAt` first
- each row has:
  - Restore
  - Delete permanently

Recommended behavior:

- disabled Restore when parent is still trashed
- inline explanation such as "Restore board first" or "Restore list first"

### Mutation hooks and cache

The client will need:

- Trash queries for the three tabs
- restore mutations
- permanent-delete mutations

Normal board caches should continue to represent live data only.

Recommended React Query additions:

- `trashKeys.boards`
- `trashKeys.lists`
- `trashKeys.tasks`

Delete-to-trash mutations should:

- update live board caches optimistically where practical
- invalidate Trash queries
- invalidate board stats for the affected board

Restore and purge mutations should:

- invalidate Trash queries
- invalidate the owning board detail and board index as needed

## CLI design

### Keep current delete verbs

To minimize user surprise in scripts and habits:

- `hirotm boards delete` moves a board to Trash
- `hirotm lists delete` moves a list to Trash
- `hirotm tasks delete` moves a task to Trash

Descriptions/help text must be updated to say "move to trash" rather than "delete".

### Add explicit restore and purge commands

Recommended resource-oriented additions:

- `hirotm boards restore <id-or-slug>`
- `hirotm boards purge <id-or-slug>`
- `hirotm lists restore --board <id-or-slug> <list-id>`
- `hirotm lists purge --board <id-or-slug> <list-id>`
- `hirotm tasks restore --board <id-or-slug> <task-id>`
- `hirotm tasks purge --board <id-or-slug> <task-id>`

### Add trash inspection commands

Recommended minimal read surface:

- `hirotm trash list`
- `hirotm trash list --type board|list|task`
- `hirotm trash list --board <id-or-slug>`

Alternative CLI shapes are possible, but the design should preserve these principles:

- existing live reads exclude trashed entities
- restore and permanent delete are explicit
- users can inspect trash without calling internal APIs directly

### CLI policy handling

Trash operations should continue to respect board CLI policy.

Implications:

- trashed board rows must keep their `board_cli_policy` association while still in Trash
- list/task trash rows can still resolve their owning board for policy checks
- CLI users should not gain trash access to boards they could not access while active

## Permanent delete and existing FK cascade

No-cascade soft delete is intentionally paired with the existing relational cascade for hard delete.

That existing behavior remains a strength:

- purge board -> SQLite cascades through lists, tasks, groups, priorities, prefs, and policy
- purge list -> SQLite cascades through tasks
- purge task -> direct row delete

This is one reason a same-table/no-cascade model is simpler than parallel trash tables.

## Migration strategy

### Schema migration

One migration should:

- add `deleted_at TEXT` to `board`
- add `deleted_at TEXT` to `list`
- add `deleted_at TEXT` to `task`
- add supporting indexes

No row backfill is needed beyond `NULL` defaults.

### FTS migration

No `task_search` schema rebuild is required for the basic Trash feature.

Only the read query in `searchTasks()` changes.

## Scope of code change

This feature touches several areas, but most changes are localized to central read/write surfaces.

### Server / storage

- `src/server/migrations/*`
  - new migration for `deleted_at` columns and indexes
- `src/server/storage/helpers.ts`
  - split raw existence vs active existence helpers
- `src/server/storage/board.ts`
  - active board index
  - active board lookup
  - active board load
  - board trash / restore / purge helpers
- `src/server/storage/lists.ts`
  - active list reader
  - list trash / restore / purge helpers
- `src/server/storage/tasks.ts`
  - active task reader
  - task trash / restore / purge helpers
- `src/server/storage/search.ts`
  - active-only FTS query predicates
- likely new module:
  - `src/server/storage/trash.ts`
    - trash list queries and shared restore/purge row shapes

### Server / routes / events / notifications

- `src/server/routes/boards.ts`
  - delete semantics change
  - live reads continue to be active-only
- likely new route:
  - `src/server/routes/trash.ts`
- `src/server/events.ts`
  - event naming / invalidation updates
- `src/shared/boardEvents.ts`
  - new trashed/restored event kinds if adopted
- `src/server/notifications/record.ts`
  - trash / restore / purge notification actions and copy

### Client

- `src/client/App.tsx`
  - add `/trash` route
- `src/client/components/layout/Sidebar.tsx`
  - add Trash nav
  - adjust board-delete UX wording
- `src/client/api/queries.ts`
  - trash queries
- `src/client/api/mutations/*`
  - delete semantics become trash
  - add restore/purge mutations
- likely new UI modules:
  - `src/client/components/trash/TrashPage.tsx`
  - supporting tab/list/item components
- board routing / sync glue
  - handle current-board-trashed redirect

### CLI

- `src/cli/index.ts`
  - update delete help text
  - add restore/purge/trash commands
- `src/cli/lib/writeCommands.ts`
  - call new restore/purge endpoints
- optional CLI output helpers for trash listing

## Risks and design guardrails

### Risk: active predicate drift

Because no-cascade derives visibility from ancestors, the main risk is not storage complexity but query inconsistency.

Guardrail:

- centralize active readers and avoid raw row queries in route handlers

### Risk: trash rows hidden by parent confusion

Users may be confused when a trashed task cannot be restored because its list or board is still trashed.

Guardrail:

- Trash responses should expose `canRestore`
- UI should explain which parent must be restored first

### Risk: semantic mismatch in "delete" naming

The UI and CLI currently use delete wording.

Guardrail:

- keep the action name in familiar places if desired
- but change confirmation copy and notifications to say "Move to Trash"
- reserve "Delete permanently" for hard delete only

## Future options

- search or filter within Trash
- bulk restore / bulk permanent delete
- retention policy for old trash entries
- actor metadata such as "deleted by"
- separate restore destinations or restore previews

## Recommendation

Implement Trash using same-table `deleted_at` columns with **no soft cascade**. Keep live reads active-only, add a dedicated Trash API/page/CLI surface for explicit trash entries, and rely on existing hard-delete cascade for permanent delete. This gives the cleanest restore semantics, keeps ids stable, preserves current board/filter/stats behavior, and scopes most code changes to the existing storage and route chokepoints already present in the codebase.
