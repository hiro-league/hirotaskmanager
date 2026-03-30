# SQLite Migration — JSON Files to Relational Database

Reference doc for migrating persistence from per-board JSON files to a normalized SQLite database managed by the Bun server. No separate DB install required — Bun ships with `bun:sqlite` built in.

---

## 1. Motivation

The current storage model writes one JSON file per board containing every list, task, and board setting as a single nested document. Every mutation (even changing one task title) sends and overwrites the entire board JSON via `PUT /api/boards/:id`. This works for early development but breaks down as boards grow:

- **No partial writes** — every save is a full-document overwrite, risking lost concurrent edits.
- **No referential integrity** — orphaned `listId` or `group` references are caught only by runtime coercion (`normalizeBoardFromJson`), not by constraints.
- **No indexed queries** — filtering, sorting, or searching tasks requires loading the whole board into memory.
- **No transactions** — multi-step operations (move task + reorder) are not atomic.

SQLite gives us all of the above with zero deployment burden (embedded in the Bun process, single file on disk).

---

## 2. Where Each Piece of Data Lives

### 2a. SQLite (domain data + board-level definitions)

Everything that defines **what exists** and has referential relationships:

| Entity | Currently | After migration |
|--------|-----------|-----------------|
| Board identity (`id`, `name`, timestamps) | Board JSON root | `board` table |
| Lists (`id`, `name`, `order`, `color`) | `board.lists[]` | `list` table, FK → `board` |
| Tasks (all fields) | `board.tasks[]` | `task` table, FK → `list`, FK → `task_group` |
| Task groups (`id`, `label`) | `board.taskGroups[]` | `task_group` table, FK → `board` |
| Workflow statuses | Hardcoded `TASK_STATUSES` const | `status` table (seeded, app-managed) |

### 2b. SQLite — `board_view_prefs` table (per-board view settings)

These fields are currently on the board JSON but are **per-user view preferences**, not intrinsic board properties. They move to a separate table so they don't pollute the domain model and can later become per-user if multi-user is added:

| Field | Currently | After migration |
|-------|-----------|-----------------|
| `visibleStatuses` | `board.visibleStatuses` (string[]) | `board_view_prefs.visible_statuses` (JSON text) |
| `statusBandWeights` | `board.statusBandWeights` (number[]) | `board_view_prefs.status_band_weights` (JSON text) |
| `boardLayout` | `board.boardLayout` (`"lanes"` \| `"stacked"`) | `board_view_prefs.board_layout` (text) |
| `boardColor` | `board.boardColor` (preset string) | `board_view_prefs.board_color` (text) |
| `backgroundImage` | `board.backgroundImage` (URL string) | `board_view_prefs.background_image` (text) |
| `showCounts` | `board.showCounts` (boolean) | `board_view_prefs.show_counts` (integer 0/1) |

This table is keyed by `board_id` today (single-user). If multi-user is added later, add a `user_id` column to make it `(board_id, user_id)`.

### 2c. Browser `localStorage` (unchanged)

These are already correctly stored client-side and should **not** move to the DB:

| Field | Storage key | Purpose |
|-------|-------------|---------|
| `themePreference` | `tm-preferences` | Light/dark/system — per-device |
| `sidebarCollapsed` | `tm-preferences` | UI chrome state |
| `boardFilterStripCollapsed` | `tm-preferences` | UI chrome state |
| `activeTaskGroupByBoardId` | `tm-preferences` | Which group filter is active — personal viewing choice |
| `lastBoardId` | `taskmanager:lastBoardId` | Navigation convenience for home redirect |

### 2d. Ephemeral React state (unchanged)

Not persisted anywhere — stays as `useState` / hook-local:

- Scroll/pan position, DnD active drag state, dialog open/closed, inline edit forms, local band weights while dragging dividers.

---

## 3. Schema Design

### 3a. `status` table

Statuses become a proper table instead of a hardcoded const. This allows renaming, reordering, and adding new statuses in future development without code changes to the const array. Statuses are **app-wide** (not per-board), managed by developers via seed/migration, not by end users.

```sql
CREATE TABLE status (
  id         TEXT    PRIMARY KEY,            -- e.g. 'open', 'in-progress', 'closed'
  label      TEXT    NOT NULL,               -- display name, e.g. 'Open', 'In Progress', 'Closed'
  sort_order INTEGER NOT NULL DEFAULT 0,     -- controls display ordering
  is_closed  INTEGER NOT NULL DEFAULT 0      -- semantic flag: 1 = terminal/done state
);
```

Seed data (matches current `TASK_STATUSES`):

```sql
INSERT INTO status (id, label, sort_order, is_closed) VALUES
  ('open',        'Open',        0, 0),
  ('in-progress', 'In Progress', 1, 0),
  ('closed',      'Closed',      2, 1);
```

Future additions (e.g. `'archived'`, `'blocked'`, `'in-review'`) are just `INSERT` statements in a migration file. The `is_closed` flag lets the UI know which statuses represent "done" without hardcoding names. `sort_order` controls the default band ordering.

### 3b. `board` table

```sql
CREATE TABLE board (
  id         INTEGER PRIMARY KEY,            -- auto-increment
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,        -- URL-friendly, derived from name
  created_at TEXT    NOT NULL,               -- ISO 8601
  updated_at TEXT    NOT NULL                -- ISO 8601
);
```

The board table is now purely identity + metadata. No nested lists, tasks, groups, or view settings. Integer PK replaces the old nanoid string — see [section 5e](#5e-dropping-nanoid--integer-primary-keys) for rationale.

### 3c. `task_group` table

```sql
CREATE TABLE task_group (
  id       INTEGER PRIMARY KEY,              -- auto-increment (replaces board-scoped numeric strings)
  board_id INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  label    TEXT    NOT NULL
);

CREATE INDEX idx_task_group_board ON task_group(board_id);
```

Group IDs are now globally unique integers (auto-increment) instead of board-scoped numeric strings (`"0"`, `"1"`, ...). This simplifies foreign keys — `task.group_id` is a plain FK to `task_group.id` without needing a composite key.

### 3d. `list` table

```sql
CREATE TABLE list (
  id         INTEGER PRIMARY KEY,            -- auto-increment
  board_id   INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color      TEXT                             -- optional hex or preset
);

CREATE INDEX idx_list_board ON list(board_id);
```

### 3e. `task` table

```sql
CREATE TABLE task (
  id         INTEGER PRIMARY KEY,            -- auto-increment
  list_id    INTEGER NOT NULL REFERENCES list(id) ON DELETE CASCADE,
  group_id   INTEGER NOT NULL REFERENCES task_group(id),
  board_id   INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  status_id  TEXT    NOT NULL REFERENCES status(id),
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',     -- markdown
  sort_order INTEGER NOT NULL DEFAULT 0,     -- within (list, status) band
  color      TEXT,                            -- optional
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE INDEX idx_task_list   ON task(list_id);
CREATE INDEX idx_task_board  ON task(board_id);
CREATE INDEX idx_task_status ON task(status_id);
CREATE INDEX idx_task_group  ON task(group_id);
```

`board_id` is denormalized on `task` (derivable from `list.board_id`) to make board-level queries efficient without joining through `list`. `status_id` remains `TEXT` because it references the `status` table's human-readable string PK (`'open'`, `'in-progress'`, `'closed'`).

### 3f. `board_view_prefs` table

```sql
CREATE TABLE board_view_prefs (
  board_id            INTEGER PRIMARY KEY REFERENCES board(id) ON DELETE CASCADE,
  visible_statuses    TEXT,                  -- JSON array, e.g. '["open","in-progress","closed"]'
  status_band_weights TEXT,                  -- JSON array, e.g. '[1, 1, 1]'
  board_layout        TEXT DEFAULT 'stacked',-- 'lanes' | 'stacked'
  board_color         TEXT,                  -- preset key from BOARD_COLOR_PRESETS
  background_image    TEXT,                  -- URL string
  show_counts         INTEGER DEFAULT 1      -- 0 or 1
);
```

When multi-user is added, change PK to `(board_id, user_id)`.

---

## 4. Relationship Diagram

```
status                        board
  id TEXT (PK) <───────┐        id INTEGER (PK, auto)
  label                │        name
  sort_order           │        slug (UNIQUE)
  is_closed            │        created_at, updated_at
                       │          │
                       │          ├──< task_group
                       │          │      id INTEGER (PK, auto)
                       │          │      board_id (FK → board)
                       │          │      label
                       │          │        │
                       │          ├──< list │
                       │          │      id INTEGER (PK, auto)
                       │          │      board_id (FK → board)
                       │          │      name, sort_order, color
                       │          │        │
                       │          ├──< task │
                       │          │      id INTEGER (PK, auto)
                       │          │      list_id (FK → list) ──────┘ (list)
                       │          │      board_id (FK → board)
                       │          │      group_id (FK → task_group) ┘ (task_group)
                       └──────────│──── status_id (FK → status)
                                  │      title, body, sort_order, color
                                  │      created_at, updated_at
                                  │
                                  └──< board_view_prefs
                                         board_id INTEGER (PK, FK → board)
                                         visible_statuses (JSON)
                                         status_band_weights (JSON)
                                         board_layout, board_color
                                         background_image, show_counts
```

---

## 5. Migration Strategy

### 5a. DB file location

Same directory logic as current JSON storage, but a single file instead of a directory tree:

| Environment | Path |
|-------------|------|
| Development | `./data/taskmanager.db` |
| Production  | `~/.taskmanager/data/taskmanager.db` |
| Override    | `$DATA_DIR/taskmanager.db` |

The `data/boards/` directory and `_index.json` become obsolete after migration.

### 5b. Schema versioning

Add a `_meta` table to track schema version:

```sql
CREATE TABLE _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO _meta (key, value) VALUES ('schema_version', '1');
```

On server startup, read `schema_version` and run any pending migration scripts sequentially. Migration scripts live in `src/server/migrations/` as numbered files (e.g. `001_initial.ts`, `002_add_archived_status.ts`).

### 5c. One-time JSON import (nanoid → integer ID mapping)

A startup routine detects whether the DB is empty and JSON files exist, then imports. The core challenge is that existing JSON data uses nanoid strings as IDs (e.g. `"EwGgsCx7v0rb3efWDKodd"` for boards, `"izk5PufnmBBuyY1-MsIyy"` for lists) while the new schema uses auto-increment integers. The import builds in-memory maps to translate every foreign key reference.

**Import procedure:**

1. Open a transaction.
2. Seed the `status` table (idempotent — skip if rows exist).
3. Read `_index.json` for the board catalog.
4. For each board entry, read its JSON file and import with ID mapping:

```typescript
// --- Board ---
const boardResult = db.run(
  "INSERT INTO board (name, slug, created_at, updated_at) VALUES (?, ?, ?, ?)",
  [json.name, indexEntry.slug, json.createdAt, json.updatedAt],
);
const boardId = boardResult.lastInsertRowid;  // new integer PK

// --- Task groups (old: board-scoped string "0","1",... → new: global integer) ---
const groupIdMap = new Map<string, number>();  // old string id → new integer id
for (const group of json.taskGroups) {
  const r = db.run(
    "INSERT INTO task_group (board_id, label) VALUES (?, ?)",
    [boardId, group.label],
  );
  groupIdMap.set(group.id, r.lastInsertRowid);
}

// --- Lists (old: nanoid string → new: integer) ---
const listIdMap = new Map<string, number>();   // old nanoid → new integer id
for (const list of json.lists) {
  const r = db.run(
    "INSERT INTO list (board_id, name, sort_order, color) VALUES (?, ?, ?, ?)",
    [boardId, list.name, list.order, list.color ?? null],
  );
  listIdMap.set(list.id, r.lastInsertRowid);
}

// --- Tasks (translate listId, group, status references) ---
for (const task of json.tasks) {
  const listId = listIdMap.get(task.listId);
  const groupId = groupIdMap.get(task.group) ?? groupIdMap.values().next().value;
  const statusId = task.status;  // stays as string ('open', 'in-progress', 'closed')

  db.run(
    `INSERT INTO task (list_id, group_id, board_id, status_id,
       title, body, sort_order, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [listId, groupId, boardId, statusId,
     task.title, task.body, task.order, task.color ?? null,
     task.createdAt, task.updatedAt],
  );
}

// --- View prefs ---
db.run(
  `INSERT INTO board_view_prefs
     (board_id, visible_statuses, status_band_weights,
      board_layout, board_color, background_image, show_counts)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [boardId,
   JSON.stringify(json.visibleStatuses),
   json.statusBandWeights ? JSON.stringify(json.statusBandWeights) : null,
   json.boardLayout ?? null,
   json.boardColor ?? null,
   json.backgroundImage ?? null,
   json.showCounts ? 1 : 0],
);
```

5. Commit the transaction.
6. Rename `data/boards/` → `data/boards_imported/` and `_index.json` → `_index.imported.json` so the import doesn't re-run. Originals are preserved for manual inspection or rollback.

If the `board` table already has rows, skip the import entirely.

**Edge cases during import:**

- **Unknown `task.group`** — if a task references a group ID not in `taskGroups`, map it to the first group (same coercion `normalizeBoardFromJson` does today).
- **Unknown `task.listId`** — skip the task and log a warning (shouldn't happen with valid data).
- **Unknown `task.status`** — coerce to `'open'` (same as current behavior).

### 5d. Startup sequence (replaces current)

```
Current:                          After:
  ensureDataDirs()                  ensureDataDir()
  migrateToSlugs()                  openOrCreateDb()
                                    runPendingMigrations()
                                    importFromJsonIfNeeded()
```

### 5e. Dropping nanoid — integer primary keys

All entity tables (`board`, `list`, `task`, `task_group`) switch from nanoid `TEXT` primary keys to `INTEGER PRIMARY KEY` (SQLite auto-increment). Benefits:

- **Smaller and faster** — 8-byte integer vs 21-character string for every PK, FK, index entry, and join.
- **No dependency** — the `nanoid` npm package can be removed from `package.json`.
- **More readable** — task #47 is easier to reference than `EwGgsCx7v0rb3efWDKodd`.

The `status` table keeps a `TEXT` PK (`'open'`, `'in-progress'`, `'closed'`) because status IDs are human-readable, few in number, and referenced by string in the codebase and API payloads.

**Optimistic IDs on the client:** The client currently generates a nanoid *before* the server responds so it can optimistically insert new entities into the TanStack Query cache (see `useCreateBoard` in `mutations.ts`). With integer auto-increment PKs, the client doesn't know the real ID until the server responds. Two approaches:

1. **Temporary placeholder IDs** — use `crypto.randomUUID()` (built into every browser, zero dependencies) or a negative counter as a temporary optimistic key. Replace with the real integer in `onSuccess`. The existing `useCreateBoard` already follows this pattern: it creates an optimistic ID, navigates, then swaps it for the server-assigned ID in `onSuccess`.
2. **Await the server for creates** — for a local-only app hitting localhost, the round-trip is negligible. Skip the optimistic insert for create operations; still use optimistic updates for edits (title changes, reorders, drag-drop) which don't need ID generation.

### 5f. Client-side localStorage — self-healing after migration

Two `localStorage` values reference the old nanoid board IDs:

| Key | Old value | What happens |
|-----|-----------|--------------|
| `taskmanager:lastBoardId` | `"EwGgsCx7v0rb3efWDKodd"` | `HomeRedirect` looks up this ID via `GET /api/boards`. It won't match any integer ID, so the lookup returns 404. The existing fallback logic redirects to the first available board. **Self-heals on first visit** — the new integer board ID is written to `lastBoardId` when the board page loads. |
| `tm-preferences` → `activeTaskGroupByBoardId` | `{ "EwGgsCx7v0rb3efWDKodd": "0" }` | The key is the old board ID. `useResolvedActiveTaskGroup` looks up the current board's integer ID in this map, finds no entry, and falls back to `ALL_TASK_GROUPS` (show all groups). **Self-heals** when the user selects a group filter — the new integer board ID is written as the key. |

No explicit cleanup migration is needed. Both values self-heal transparently on first use. The only user-visible effect is a one-time reset: the home page may open a different board than last time, and group filters reset to "all groups." This is acceptable for an early-development local app.

---

## 6. Server Storage Layer Changes

### 6a. New file: `src/server/db.ts`

Owns the `bun:sqlite` `Database` instance. Exports:

- `getDb(): Database` — lazy-open singleton.
- `runMigrations()` — reads `schema_version`, applies pending scripts.
- `importFromJson()` — one-time import (section 5c).
- Transaction helper: `withTransaction(fn)` wrapping `BEGIN` / `COMMIT` / `ROLLBACK`.

### 6b. Replace `src/server/storage.ts`

The current file (JSON read/write, index management, atomic file writes, slug migration) is replaced entirely. New storage functions operate on SQLite:

| Current function | Replacement |
|------------------|-------------|
| `readBoardIndex()` | `SELECT id, slug, name, created_at FROM board` |
| `readBoardFile(id)` | Multi-query: board row + task_groups + lists + tasks + view_prefs, assembled into `Board` shape |
| `writeBoardAtomic(board, slug)` | **Eliminated** — replaced by granular mutations |
| `syncIndexFromBoard()` | **Eliminated** — index is just a `SELECT` on `board` |
| `entryByIdOrSlug(ref)` | `SELECT ... FROM board WHERE id = ? OR slug = ?` (id is now integer; slug lookup supports old bookmarks) |
| `generateSlug()` | `SELECT slug FROM board` → compute unique slug |
| `deleteBoardFile()` | `DELETE FROM board WHERE id = ?` (cascades) |
| `renameBoardFile()` | `UPDATE board SET slug = ? WHERE id = ?` |
| `migrateToSlugs()` | **Eliminated** — slugs are a column from the start |
| `ensureDataDirs()` | `ensureDataDir()` — just the parent directory |

### 6c. New: granular query/mutation functions

Instead of read-whole-board / write-whole-board, the storage layer exposes entity-level operations:

```
Board:       getBoards, getBoard, createBoard, updateBoard, deleteBoard
List:        getListsForBoard, createList, updateList, deleteList, reorderLists
Task:        getTasksForBoard, createTask, updateTask, deleteTask, reorderTasks
TaskGroup:   getGroupsForBoard, createGroup, updateGroup, deleteGroup
ViewPrefs:   getViewPrefs, updateViewPrefs
Status:      getStatuses  (read-only for client; mutations via migrations only)
```

Each mutation runs in a transaction. Reorder operations use a single `UPDATE ... CASE` statement or a loop of updates within one transaction.

---

## 7. API Route Changes

### 7a. Existing endpoints — behavior changes

The REST shape stays the same but the implementation switches from whole-document I/O to targeted queries:

| Endpoint | Before | After |
|----------|--------|-------|
| `GET /api/boards` | Read `_index.json` | `SELECT` from `board` |
| `POST /api/boards` | Build full doc, write JSON | `INSERT` board + default groups + default view prefs |
| `GET /api/boards/:id` | Read JSON file, normalize | Multi-table `SELECT`, assemble response |
| `PUT /api/boards/:id` | Overwrite entire JSON | **See below** |
| `DELETE /api/boards/:id` | Delete file + index entry | `DELETE FROM board` (cascades) |

### 7b. Breaking up `PUT /api/boards/:id`

The current `PUT` accepts the entire board document and overwrites everything. This is the biggest API change. Two approaches (not mutually exclusive):

**Option A — Keep the monolithic PUT for now, diff server-side.** The server receives the full board JSON, diffs it against the DB state, and applies granular SQL mutations in a transaction. Client code stays unchanged. This is the lowest-risk migration path.

**Option B — Add granular endpoints, migrate client incrementally.** New endpoints for individual operations:

```
PATCH  /api/boards/:id                    — update board name
POST   /api/boards/:id/lists              — create list
PATCH  /api/boards/:id/lists/:listId      — rename/recolor list
DELETE /api/boards/:id/lists/:listId      — delete list + tasks
PUT    /api/boards/:id/lists/order        — reorder lists
POST   /api/boards/:id/tasks              — create task
PATCH  /api/boards/:id/tasks/:taskId      — update task fields
DELETE /api/boards/:id/tasks/:taskId      — delete task
PUT    /api/boards/:id/tasks/reorder      — reorder tasks within band
PATCH  /api/boards/:id/groups             — update task group definitions
PATCH  /api/boards/:id/view-prefs         — update view preferences
GET    /api/statuses                      — list available statuses
```

**Recommended approach:** Start with **Option A** to unblock the migration without touching client code. Then incrementally add granular endpoints (Option B) and migrate client mutations one by one. The monolithic PUT can be deprecated and removed once all client mutations use granular endpoints.

### 7c. New endpoint: `GET /api/statuses`

Returns the `status` table rows so the client can render status labels, ordering, and the `is_closed` flag without hardcoding:

```json
[
  { "id": "open",        "label": "Open",        "sortOrder": 0, "isClosed": false },
  { "id": "in-progress", "label": "In Progress", "sortOrder": 1, "isClosed": false },
  { "id": "closed",      "label": "Closed",      "sortOrder": 2, "isClosed": true  }
]
```

### 7d. Response shape for `GET /api/boards/:id`

The assembled response should match the current `Board` interface shape (with view prefs inlined) so the client works without changes during the transition:

```json
{
  "id": 1,
  "name": "Hiro Tasks Board",
  "slug": "hiro-tasks-board",
  "taskGroups": [{ "id": 1, "label": "Feature" }, { "id": 2, "label": "Bug" }],
  "visibleStatuses": ["open"],
  "statusBandWeights": [1],
  "boardLayout": "lanes",
  "boardColor": "violet",
  "showCounts": true,
  "lists": [{ "id": 1, "name": "General Ideas", "order": 0 }],
  "tasks": [{ "id": 1, "listId": 1, "groupId": 1, "title": "...", "status": "open", ... }],
  "createdAt": "...",
  "updatedAt": "..."
}
```

All IDs are now integers. The server assembles this from `board` + `board_view_prefs` + `task_group` + `list` + `task` queries. Client types (`Board`, `List`, `Task`, `GroupDefinition`) need their `id` fields updated from `string` to `number`.

---

## 8. Client Changes

### 8a. Phase 1 (DB migration, minimal client changes)

The monolithic PUT is kept (Option A) so the data flow is unchanged. The client continues to fetch `Board` objects via TanStack Query and send full `Board` JSON via `useUpdateBoard`. Required client changes in Phase 1:

- **Type updates** — `id` fields change from `string` to `number` in `Board`, `List`, `Task`, `GroupDefinition`. This ripples through components that compare or pass IDs.
- **`mutations.ts`** — replace `nanoid()` calls with `crypto.randomUUID()` for optimistic placeholder IDs (or remove optimistic inserts for creates). Remove the `nanoid` import.
- **`Task.group` → `Task.groupId`** — rename to match the DB column and response shape.
- View preferences in the board payload are split into `board_view_prefs` transparently by the server.

### 8b. Phase 2 (granular mutations, client updates)

When granular endpoints are added, update `mutations.ts` hooks one at a time:

| Current hook | Current behavior | New behavior |
|-------------|------------------|--------------|
| `useCreateList` | Builds full board, calls `useUpdateBoard` | `POST /api/boards/:id/lists` |
| `useRenameList` | Builds full board, calls `useUpdateBoard` | `PATCH /api/boards/:id/lists/:listId` |
| `useDeleteList` | Builds full board, calls `useUpdateBoard` | `DELETE /api/boards/:id/lists/:listId` |
| `useCreateTask` | Builds full board, calls `useUpdateBoard` | `POST /api/boards/:id/tasks` |
| `useUpdateTask` | Builds full board, calls `useUpdateBoard` | `PATCH /api/boards/:id/tasks/:taskId` |
| `useDeleteTask` | Builds full board, calls `useUpdateBoard` | `DELETE /api/boards/:id/tasks/:taskId` |
| `useReorderLists` | Builds full board, calls `useUpdateBoard` | `PUT /api/boards/:id/lists/order` |

Each hook's optimistic update logic stays similar (update TanStack Query cache), but the `mutationFn` sends a targeted payload instead of the whole board.

### 8c. Status references

Replace the hardcoded `TASK_STATUSES` const with data fetched from `GET /api/statuses`. Add a `useStatuses()` query hook. Components that currently import `TASK_STATUSES` switch to consuming this hook. The `coerceTaskStatus` helper moves server-side (validation against the `status` table).

---

## 9. Shared Types Changes (`src/shared/models.ts`)

### Remove

- `TASK_STATUSES` const and `TaskStatus` type (replaced by `Status` from DB)
- `DEFAULT_STATUS_DEFINITIONS` (deprecated alias)
- `coerceTaskStatus()` (moves to server validation)
- `normalizeBoardFromJson()` (no longer needed — DB enforces shape)
- `normalizeTask()` (same reason)
- `parseTaskGroupsFromRaw()` (same reason)
- `BoardIndexEntry` (replaced by the board list query response type)

### Add

```typescript
interface Status {
  id: string;
  label: string;
  sortOrder: number;
  isClosed: boolean;
}
```

### Keep (adjust for integer IDs)

- `Board`, `List`, `Task`, `GroupDefinition` interfaces — keep as API response types. Change all `id` fields from `string` to `number`. `Task.status` becomes `string` (validated server-side against `status` table) instead of the narrow `TaskStatus` union. `Task.group` → `Task.groupId` (number) for consistency with the DB column name.
- `BoardLayout`, `resolvedBoardLayout()` — keep.
- `ALL_TASK_GROUPS` — keep (client-only sentinel, but note: the `activeTaskGroupByBoardId` map values change from string group IDs like `"0"` to integer group IDs like `1`).
- `createDefaultTaskGroups()` — **remove** (server seeds defaults on board creation; client no longer needs to construct group objects).
- `nextGroupId()` — **remove** (server assigns auto-increment IDs; client sends label only when creating a group).
- `groupLabelForId()` — keep for client display use.
- Board color types — keep in `boardColor.ts`.

---

## 10. Files Changed / Added / Removed

```
Added:
  src/server/db.ts                         -- Database singleton, connection, helpers
  src/server/migrations/                   -- Migration scripts directory
  src/server/migrations/001_initial.ts     -- Initial schema creation + seed
  src/server/migrations/runner.ts          -- Migration runner (reads _meta, applies pending)
  src/server/import.ts                     -- One-time JSON → SQLite import with ID mapping

Changed:
  src/server/storage.ts                    -- Gutted and rewritten: SQL queries replace JSON I/O
  src/server/index.ts                      -- Startup: openDb + runMigrations + importFromJson
  src/server/routes/boards.ts              -- Route handlers use new storage functions
  src/shared/models.ts                     -- Remove normalization; add Status type;
                                              change id fields from string to number
  src/client/api/queries.ts                -- Add useStatuses(); adjust for integer IDs
  src/client/api/mutations.ts              -- Remove nanoid import; use server-assigned IDs;
                                              Phase 2: granular endpoints
  package.json                             -- Remove nanoid dependency (bun:sqlite is built in,
                                              crypto.randomUUID() replaces nanoid for optimistic IDs)

Removed (after migration verified):
  data/_index.json                         -- Replaced by board table
  data/boards/*.json                       -- Replaced by taskmanager.db
  nanoid (dependency)                      -- No longer needed

Archived (by import routine):
  data/boards/ → data/boards_imported/     -- Preserved for rollback
  data/_index.json → data/_index.imported.json

No changes:
  src/client/store/preferences.ts          -- localStorage prefs unchanged (self-heals, see 5f)
  src/client/components/**                 -- Phase 1: no UI changes
  src/shared/boardColor.ts                 -- Unchanged
  src/shared/slug.ts                       -- Still used for slug generation
```

---

## 11. Implementation Order

Following the project's bottom-up discipline:

1. **`src/server/db.ts`** — Database connection, `withTransaction`, `getDb`.
2. **`src/server/migrations/001_initial.ts`** — Full schema DDL (integer PKs) + status seed data.
3. **`src/server/migrations/runner.ts`** — Read `_meta.schema_version`, apply pending.
4. **`src/server/import.ts`** — One-time JSON → SQLite import with nanoid-to-integer ID mapping (section 5c).
5. **`src/server/storage.ts`** — Rewrite with SQL query functions (integer IDs throughout).
6. **`src/server/index.ts`** — New startup sequence.
7. **`src/server/routes/boards.ts`** — Rewire handlers to new storage (keep response shapes but with integer IDs).
8. **`src/shared/models.ts`** — Add `Status` type, change `id` fields from `string` to `number`, remove normalization code.
9. **`src/client/api/mutations.ts`** — Replace `nanoid` imports with `crypto.randomUUID()` for optimistic IDs, or remove optimistic ID generation for creates.
10. **`src/client/api/queries.ts`** — Add `useStatuses()`.
11. **`package.json`** — Remove `nanoid` dependency.
12. **Test** — Verify existing UI works identically against the new backend. Confirm localStorage self-heals (section 5f).
13. **Phase 2** — Granular endpoints + client mutation updates (can be done incrementally).

**Progress (main branch):** Steps **1–11** are implemented (SQLite storage, import, integer IDs, `GET /api/statuses`, `useStatuses()` / workflow order, **`nanoid` removed** from `package.json`). **Step 13 (Phase 2)** — granular REST endpoints and client hooks are implemented: `PATCH` view-prefs / groups / board name, list and task CRUD + reorder routes, `usePatchBoardViewPrefs`, `usePatchBoardName`, `usePatchBoardTaskGroups`, and list/task mutations calling the new APIs. Monolithic **`PUT /api/boards/:id`** remains available; **`normalizeBoardFromJson`** / **`coerceTaskStatus`** still used for that path and for `GET` response parsing. Step **12** is ongoing manual QA.

---

## 12. Rollback / Safety

- The JSON import is non-destructive: original files are renamed to `data/boards_imported/`, not deleted, until the migration is verified.
- The `_meta` table tracks schema version; rolling back means restoring the DB file from backup (single file copy).
- During early development the "no backward-compatibility promise" still applies — it's acceptable to delete the DB and re-import from JSON if the schema changes.
