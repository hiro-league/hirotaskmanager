# TaskManager — Architecture & Design Guidelines

Reference for future development. Update this file when architecture or scope changes.

## Resolved decisions

1. **Development runtime** — ~~CLOSED.~~ `npm run dev` runs two processes via `concurrently` (Bun API on fixed port **3001** + Vite dev server). Vite's built-in `server.proxy` forwards `/api` requests to `http://localhost:3001`. No port scanning, no `.dev/api-port` file, no custom proxy plugin.

2. **Production serving** — ~~CLOSED.~~ `npm run build && npm start` runs a single Bun process. Hono serves API routes **and** the Vite-built SPA from `dist/` via `serveStatic` + an `index.html` fallback for client-side routing. Default port is **3001** (override with `PORT` env var). Data is stored at `~/.taskmanager/data` in production (override with `DATA_DIR` env var); in development it defaults to `./data` in the repo root.

## Investigation (open decisions / partial implementation)

These items remain open. (Numbering preserved from the original architecture review.)

8. **Project layout vs. code** — Guidelines below list the **current** notable paths. Reconcile occasionally: e.g. board data hooks live in **`src/client/api/queries.ts`** (`useBoard`, `useBoards`), not a separate `hooks/useBoard.ts`; board drag-and-drop is implemented in **`BoardColumns.tsx`** (see [Drag & drop](#drag--drop)). New files should extend this structure rather than reintroducing obsolete plan names unless there is a deliberate refactor.

9. **Dependencies** — Keep **`package.json`** aligned with what this doc claims (e.g. major versions). Periodically review upgrades (Vite, React, Hono, TanStack Query, @dnd-kit), security advisories, and whether dev-only tools (`concurrently`, `npx bun` in scripts) match how contributors run the repo.

## Not yet implemented

Planned or described in earlier specs but **absent or incomplete** in the codebase today. (Items **3** and **4** match the architecture review; add more as needed.)

3. **`GET /api/boards/:id/export`** — Markdown/JSON export with optional type/status filters; server route module (e.g. `export.ts`) and any client export UI.

4. **Board vs client prefs** — **`taskGroups`** (the list of group names) and **`visibleStatuses`** live on the **board document** and update via **PUT** + TanStack Query. **Which task group is active for filtering** (`ALL_TASK_GROUPS` = all groups, or a specific group id) is stored in **`src/client/store/preferences.ts`** (persisted to `localStorage`, keyed by board id). **Filter strip collapsed** is a **global** app preference in the same store. There is **no** `activeTaskType` (or similar) field on the board.

- **Other plan gaps** — e.g. full board settings beyond task groups, shared `ExportDialog`, etc., may still be missing; treat the repo as source of truth and extend this list when you add features.

## Scope

Browser-based, **local-only** task board: JSON on disk for human/AI readability, **list columns** (each list is a column) with **stacked status bands** inside each column. Each task has a **`group`** string chosen from the board’s **`taskGroups`** list; the list view can filter by one group or show all (filter selection is client-persisted, not in board JSON).

## Tech Stack

| Layer | Choice |
| ----- | ------ |
| Runtime | Bun |
| Backend | Hono (API routes + static SPA in production via `serveStatic`) |
| Frontend | React 19 + TypeScript |
| Build | Vite (see `package.json` for current major version) |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Client UI state | Zustand: `store/selection.ts` (selected board); **`store/preferences.ts`** (theme, sidebar, **task group filter per board**, **board filter strip collapsed**); definitions on the board (`taskGroups`, `visibleStatuses`) via TanStack Query + PUT |
| Server / remote state | TanStack Query v5 (caching, optimistic updates) |
| Drag & drop | @dnd-kit — patterns in [`docs/drag_drop.md`](drag_drop.md) |
| Markdown | `@uiw/react-md-editor` (edit), `react-markdown` (preview) |
| IDs | nanoid |

## High-Level Architecture

```mermaid
graph LR
  subgraph browser [Browser]
    SPA["React SPA"]
    Zustand["Zustand Store"]
    TQ["TanStack Query"]
    SPA --> Zustand
    SPA --> TQ
  end

  subgraph server [Bun Process]
    Hono["Hono Server"]
    Storage["storage.ts"]
    Hono --> Storage
  end

  subgraph disk [Disk]
    Index["data/_index.json"]
    Boards["data/boards/*.json"]
  end

  TQ -->|"fetch /api/*"| Hono
  Storage -->|"read/write JSON"| Boards
  Storage -->|"read/write index"| Index
```

**Process model (dev):** `npm run dev` runs two processes via `concurrently` — Bun API on port 3001 and Vite dev server. Vite's built-in `server.proxy` forwards `/api` to the API.

**Process model (production):** `npm run build && npm start` runs a single Bun process serving both API routes and the built SPA from `dist/`.

**Data directory:** Configurable via `DATA_DIR` env var. Defaults to `./data` in development, `~/.taskmanager/data` in production.

**Server role:** Thin file I/O layer — no heavy business logic in routes; persistence and atomic writes live in storage.

## Data Model

All shared types belong in `src/shared/models.ts` and are used by both server and client.

```typescript
/** Row in `data/_index.json` — lightweight board list for the sidebar. */
interface BoardIndexEntry {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

interface Board {
  id: string;
  name: string;
  backgroundImage?: string;
  /** User-defined task group names for this board. */
  taskGroups: string[];
  statusDefinitions: string[];
  visibleStatuses: string[];
  /** Flex weights for each visible status band (same length / order as rendered visible statuses). */
  statusBandWeights?: number[];
  showCounts: boolean;
  lists: List[];
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

interface List {
  id: string;
  name: string;
  order: number;
  color?: string;
}

interface Task {
  id: string;
  listId: string;
  title: string;
  body: string;                  // Markdown
  group: string;                 // Task group id (from board.taskGroups)
  status: string;
  order: number;                 // Within (list, status) band
  color?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Guideline:** Tasks are stored **flat** (sibling to `lists`) with `listId`. **`normalizeBoardFromJson`** in `models.ts` maps legacy on-disk keys (`taskTypes` → `taskGroups`, task `type` → `group`) when reading. Filtering by group/status uses a simple `.filter()` without deep nesting.

## On-Disk Storage

```
data/
  _index.json              # BoardIndexEntry[] — board catalog
  boards/
    {board-id}.json        # Full board document (lists + tasks)
```

- One JSON file per board so tools (and people) can open a single file and see the whole board.
- `_index.json` is the lightweight index for listing boards.
- Storage code should use **atomic writes** (e.g. write temp file then rename) in `src/server/storage.ts`.
- Data directory is resolved by `storage.ts`: `DATA_DIR` env var > `./data` (dev) > `~/.taskmanager/data` (production).

## API Routes

Implemented today: list/create/read/update/delete boards. **Export is not implemented** (see [Not yet implemented](#not-yet-implemented)).

| Method | Endpoint | Action |
| ------ | -------- | ------ |
| GET | `/api/health` | Liveness check |
| GET | `/api/boards` | List boards from `_index.json` |
| POST | `/api/boards` | Create board, write new file, update index |
| GET | `/api/boards/:id` | Read board JSON |
| PUT | `/api/boards/:id` | Overwrite board JSON |
| DELETE | `/api/boards/:id` | Remove board file and index entry |

Implement routes under `src/server/routes/`; keep I/O in `storage.ts`.

## UI: list columns and status bands

**Layout:** The board is **list columns all the way** — a horizontal sequence of list columns. Each column has a **header** and a **vertical stack of status bands** (one band per visible status). Band heights use **`statusBandWeights`** (flex) with splitters as needed. A **status label column** aligns with those bands across lists. Tasks appear inside the band that matches `(listId, status)`, then optionally by **task group** depending on the client filter.

**Data selection (conceptual):** Let `activeGroup` be the persisted preference (`ALL_TASK_GROUPS` or a string in `board.taskGroups`). For each list column, for each visible status:

```typescript
board.lists.map((list) =>
  visibleStatuses.map((status) =>
    tasks
      .filter((t) => {
        const groupOk =
          activeGroup === ALL_TASK_GROUPS || t.group === activeGroup;
        return (
          groupOk && t.listId === list.id && t.status === status
        );
      })
      .sort(byOrder)
  )
);
```

**Component direction:** Shell with board selection (`AppShell`, `Sidebar`); **`BoardView`** with title, **task group switcher**, **status visibility toggles**, collapsible filter strip, and **`TaskGroupsEditorDialog`**; **`BoardColumns`** orchestrates list columns, DnD, and the label column; **`BoardListColumn`** / **`ListStatusBand`** / **`boardStatusUtils`** own band sizing and visibility helpers; **`ListHeader`** per list; **`TaskCard`** / **`TaskEditor`** for tasks. Preserve **TanStack Query + mutations** (optimistic updates where used) as the data path.

## Drag & drop

Do **not** duplicate long DnD guidance here. Use **[`docs/drag_drop.md`](drag_drop.md)** as the reference for @dnd-kit patterns (e.g. `DndContext`, `SortableContext`, `DragOverlay`, optimistic reorder during `onDragOver`, collision detection). Implementation today is centered on **`src/client/components/board/BoardColumns.tsx`** (list reorder, task moves between bands).

## Project layout (current direction)

```
taskmanager/
  package.json
  vite.config.ts
  tsconfig.json
  components.json               # shadcn/ui
  src/
    shared/
      models.ts
    server/
      index.ts
      routes/
        boards.ts
      storage.ts
    client/
      main.tsx
      App.tsx
      api/
        queries.ts              # useBoards, useBoard, fetch helpers
        mutations.ts
      store/
        selection.ts            # e.g. selectedBoardId
        preferences.ts          # theme, sidebar, task group filter per board, filter strip collapsed
      components/
        ui/                     # shadcn/ui primitives (Button, Dialog, Input, …)
        layout/                 # AppShell, Sidebar
        board/                  # BoardView, BoardColumns, BoardListColumn,
                                # ListStatusBand, StatusLabelColumn, boardStatusUtils, …
        task/                   # TaskCard, TaskEditor
        list/                   # ListHeader, …
      lib/
        utils.ts
  data/                         # runtime (dev default; see On-Disk Storage)
    _index.json
    boards/
```

## shadcn/ui primitives (`components/ui/`)

All reusable UI primitives (Button, Dialog, Input, Select, DropdownMenu, etc.) belong in **`src/client/components/ui/`** and should be installed via `npx shadcn@latest add <component>`. These components consume the CSS custom-property theme defined in `index.css` (`--primary`, `--background`, `--muted`, etc.), which is what makes dark/light mode and custom color themes work automatically across the app.

**Do not** build ad-hoc form controls, modals, or menus from raw HTML — always check if a shadcn/ui primitive exists first. Skipping this leads to styling that bypasses the theme system and won't respond to dark mode or palette changes.

## Implementation discipline (bottom-up)

When adding large features, prefer:

1. Shared types (`src/shared/models.ts`)
2. Server storage + routes
3. Client API layer (Query + mutations)
4. Core board UI (list columns + bands)
5. Interaction (DnD per `docs/drag_drop.md`, inline edits)
6. Settings, export, polish

This keeps the app testable at each layer and avoids UI that cannot be persisted.
