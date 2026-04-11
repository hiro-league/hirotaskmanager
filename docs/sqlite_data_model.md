# SQLite data model (current)

Authoritative DDL is applied by numbered migrations under `src/server/migrations/` (e.g. `001_initial.ts`, `003_task_search_fts5.ts`). The running schema version is stored in `_meta.schema_version` and applied by `src/server/migrations/runner.ts`.

This document describes the **latest** tables only: structure, how they map to `src/shared/models.ts`, and which product/API surface each table backs.

---

## Tables overview

| Table | Role |
|--------|------|
| `status` | App-wide workflow statuses (Open / In Progress / Closed, …); seeded, not user-created per board. |
| `board` | Board identity and metadata (name, URL slug, timestamps). |
| `task_group` | Per-board task categories (e.g. feature / bug) used as `groupId` on tasks. |
| `list` | Kanban columns within a board; ordered with `sort_order`. |
| `task` | Tasks: body content, workflow status, ordering within a list+status band, optional colors. |
| `task_search` | FTS5 virtual table over task `title` / `body`; kept in sync via triggers on `task`. |
| `board_view_prefs` | Per-board UI preferences (layout, visible bands, weights, chrome) — not core domain identity. |
| `_meta` | Internal key/value store (currently `schema_version` for migrations). |

---

## `status`

**Purpose:** Workflow states for tasks; referenced by `task.status_id`. Ordering for columns/bands comes from `sort_order`; `is_closed` marks terminal/done semantics for the UI.

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | Stable ids, e.g. `open`, `in-progress`, `closed`. |
| `label` | TEXT | Display name. |
| `sort_order` | INTEGER | Default ordering. |
| `is_closed` | INTEGER | `0` / `1` boolean. |

**Maps to:** `Status` in `models.ts` (`sortOrder`, `isClosed` in JSON).

**Features / API:** `GET /api/statuses` → `listStatuses()` in `src/server/storage/board.ts`. Used when rendering status bands, validating task status on create/update, and coercing invalid values server-side.

---

## `board`

**Purpose:** One row per board; primary key is the stable `id` used in URLs and foreign keys.

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PK | Auto-increment. |
| `name` | TEXT | Display name. |
| `slug` | TEXT UNIQUE | URL segment; regenerated when the board is renamed (`patchBoardName`). |
| `created_at` | TEXT | ISO 8601. |
| `updated_at` | TEXT | ISO 8601. |

**Maps to:** `Board.id`, `Board.name`, `Board.slug`, `Board.createdAt`, `Board.updatedAt`. Other `Board` fields come from joined tables or `board_view_prefs`.

**Features / API:** Board list (`GET /api/boards`), create (`POST /api/boards`), load (`GET /api/boards/:id`), rename (`PATCH /api/boards/:id`), delete (`DELETE /api/boards/:id`). Sidebar and routing use `BoardIndexEntry` (`id`, `slug`, `name`, `createdAt`).

---

## `task_group`

**Purpose:** Labels for grouping tasks (e.g. type/theme) within a board. IDs are global integers (FK target for `task.group_id`).

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PK | Auto-increment. |
| `board_id` | INTEGER FK → `board(id)` CASCADE | |
| `label` | TEXT | |

**Maps to:** `GroupDefinition` (`id`, `label`) inside `Board.taskGroups`.

**Features / API:** `PATCH /api/boards/:id/groups` applies explicit creates, updates, and deletes (`patchBoardTaskGroupConfig`). Task create/patch require a valid `groupId` for that board.

---

## `list`

**Purpose:** Kanban columns on a board.

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PK | Auto-increment. |
| `board_id` | INTEGER FK → `board(id)` CASCADE | |
| `name` | TEXT | |
| `sort_order` | INTEGER | Column order. |
| `color` | TEXT | Optional (hex or preset). |

**Maps to:** `List` (`id`, `name`, `order` ← `sort_order`, `color`).

**Features / API:** Create/list patch/delete (`POST/PATCH/DELETE …/lists/…`), reorder (`PUT …/lists/order`). Tasks reference `list_id`.

---

## `task`

**Purpose:** Atomic work items. `board_id` is denormalized from the list’s board for efficient board-scoped queries. `sort_order` is ordering within a **list + status** band (same semantics as the UI “stack” within a column/status).

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PK | Auto-increment. |
| `list_id` | INTEGER FK → `list(id)` CASCADE | |
| `group_id` | INTEGER FK → `task_group(id)` | |
| `board_id` | INTEGER FK → `board(id)` CASCADE | Denormalized. |
| `status_id` | TEXT FK → `status(id)` | |
| `title` | TEXT | |
| `body` | TEXT | Markdown. |
| `sort_order` | INTEGER | Order within list + status band. |
| `color` | TEXT | Optional. |
| `created_at` | TEXT | ISO 8601. |
| `updated_at` | TEXT | ISO 8601. |

**Maps to:** `Task` (`listId`, `groupId`, `status` ← `status_id`, `order` ← `sort_order`, etc.).

**Features / API:** `POST/PATCH/DELETE …/tasks/…`, reorder within a band (`PUT …/tasks/reorder` with `listId`, `status`, `orderedTaskIds`). Drives cards on the board, drag-and-drop between lists/statuses, and inline edits.

---

## `task_search` (FTS5)

**Purpose:** Full-text search over task text plus denormalized list name, task group label, and workflow status label. Not a separate domain entity; one row per task.

| Column | Type | Notes |
|--------|------|--------|
| `task_id` | UNINDEXED | Matches `task.id`. |
| `board_id` | UNINDEXED | Matches `task.board_id`; used to filter board-scoped search. |
| `title` | indexed | From `task.title`. |
| `body` | indexed | From `task.body`. |
| `list_name` | indexed | From `list.name` for `task.list_id`. |
| `group_label` | indexed | From `task_group.label` for `task.group_id`. |
| `status_label` | indexed | From `status.label` for `task.status_id`. |

**Maintenance:** Triggers on `task` (insert / update / delete) keep rows aligned. `AFTER UPDATE OF name` on `list`, `AFTER UPDATE OF label` on `task_group`, and `AFTER UPDATE OF label` on `status` reindex affected tasks so renames stay searchable. CASCADE deletes on tasks still remove FTS rows via the task delete trigger.

**Features / API:** `GET /api/search` (`q`, optional `board`, optional `limit`, optional `prefix` — default adds `*` to the last token for prefix match; `prefix=0` disables). CLI: `hirotm query search` (global `--format human` for a table; `--no-prefix` to disable last-token prefix match).

---

## `board_view_prefs`

**Purpose:** Per-board **view** settings kept out of `board` so domain rows stay small and future multi-user prefs can add a `user_id` without reshaping core tables.

| Column | Type | Notes |
|--------|------|--------|
| `board_id` | INTEGER PK FK → `board(id)` CASCADE | One row per board today. |
| `visible_statuses` | TEXT | JSON array of status ids. |
| `status_band_weights` | TEXT | JSON array of numbers (flex weights for visible bands). |
| `board_layout` | TEXT | `lanes` or `stacked` (default `stacked`). |
| `board_color` | TEXT | Preset key (`BoardColorPreset`). |
| `background_image` | TEXT | URL or empty. |
| `show_counts` | INTEGER | `0` / `1`. |

**Maps to:** `Board.visibleStatuses`, `Board.statusBandWeights`, `Board.boardLayout`, `Board.boardColor`, `Board.backgroundImage`, `Board.showStats` (column `show_counts`).

**Features / API:** `PATCH /api/boards/:id/view-prefs` (`patchBoardViewPrefs`). Affects layout mode, status band visibility, column width weights, board chrome, and count badges — not task/list CRUD.

---

## `_meta`

**Purpose:** Migration bookkeeping.

| Column | Type | Notes |
|--------|------|--------|
| `key` | TEXT PK | e.g. `schema_version`. |
| `value` | TEXT | Opaque string (numeric version for `schema_version`). |

**Maps to:** Not exposed in app models.

---

## Relationships (summary)

```
status (id)
    ↑
task.status_id

board (id)
    ├── task_group.board_id
    ├── list.board_id
    ├── task.board_id          ← denormalized copy for queries
    └── board_view_prefs.board_id

list (id)
    └── task.list_id

task_group (id)
    └── task.group_id
```

Deleting a board cascades to its lists, tasks (via list and board FKs), task groups, and view prefs. Tasks also reference `task_group` and `status`; those parent rows are not deleted when a task is deleted.

---

## Not in SQLite

Client-only preferences (`themePreference`, sidebar state, last board id, per-board active group filter in the UI, etc.) stay in **localStorage** as described in `sqlite_migration.md` §2c — they are intentionally not in this schema.
