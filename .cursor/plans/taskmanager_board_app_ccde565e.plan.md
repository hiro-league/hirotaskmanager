---
name: TaskManager Board App
overview: Build a browser-based, local-only task board app with a Bun + Hono backend serving a React 19 SPA. Data stored as JSON files on disk for AI/Cursor friendliness. The board renders as a 2D matrix (columns = lists, rows = statuses) with a global task-type mode switcher.
todos:
  - id: scaffold
    content: "Scaffold project: bun init, install all dependencies (React 19, Vite 6, Hono, Tailwind 4, shadcn/ui, Zustand, TanStack Query, @dnd-kit, markdown libs, nanoid). Configure vite.config.ts with API proxy, tsconfig, tailwind."
    status: pending
  - id: shared-types
    content: Create src/shared/models.ts with Board, List, Task interfaces and default task types/statuses.
    status: pending
  - id: server-storage
    content: Build src/server/storage.ts — atomic JSON read/write to data/ directory. Ensure data/ and data/boards/ are created on startup.
    status: pending
  - id: server-routes
    content: "Build Hono routes: GET/POST /api/boards, GET/PUT/DELETE /api/boards/:id, GET /api/boards/:id/export (md + json with optional type/status filters)."
    status: pending
  - id: server-entry
    content: Wire up src/server/index.ts — Hono app, mount routes, serve static assets in production mode.
    status: pending
  - id: client-shell
    content: Build AppShell + Sidebar with board list, board creation, and board switching. Set up React Router (or simple state-based routing).
    status: pending
  - id: client-api
    content: Build TanStack Query hooks (queries.ts + mutations.ts) for all board CRUD operations with optimistic updates.
    status: pending
  - id: client-store
    content: Build Zustand store (board-ui.ts) for active task type, visible statuses, and UI preferences.
    status: pending
  - id: board-matrix
    content: "Build the core matrix grid: BoardView, BoardToolbar (type switcher + status filter), MatrixGrid, StatusRow, Cell. CSS Grid layout with status rows x list columns."
    status: pending
  - id: task-cards
    content: Build TaskCard (markdown preview, color, title) and TaskEditor modal (markdown editor, type/status selectors, color picker).
    status: pending
  - id: dnd
    content: "Implement drag & drop: list column reordering, task reordering within cells, task movement across cells using @dnd-kit."
    status: pending
  - id: list-management
    content: "Build list CRUD: create, rename, delete lists. ListHeader with inline rename and accent color."
    status: pending
  - id: board-settings
    content: "Build board settings: rename, background image, manage task types, manage status definitions, toggle counts display."
    status: pending
  - id: export
    content: "Build ExportDialog: export current board or filtered view as Markdown or JSON. Wire to /api/boards/:id/export."
    status: pending
  - id: polish
    content: "Visual polish: board background images, task/list colors, count badges on list headers and status rows, responsive layout, empty states."
    status: pending
isProject: false
---

# TaskManager — Local Board App

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono (serves API + static SPA build)
- **Frontend**: React 19 + TypeScript
- **Build**: Vite 6
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Client state**: Zustand (UI prefs — active type, visible statuses)
- **Server state**: TanStack Query v5 (caching, optimistic updates)
- **Drag & Drop**: @dnd-kit
- **Markdown editing**: @uiw/react-md-editor
- **Markdown rendering**: react-markdown
- **IDs**: nanoid

## Architecture

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



Single Bun process. Vite proxies `/api/*` to Hono in dev. In production mode, Hono serves the built Vite assets directly.

## Data Model

All types live in `src/shared/models.ts` and are shared between server and client.

```typescript
interface Board {
  id: string;
  name: string;
  backgroundImage?: string;
  taskTypes: string[];           // ["feature", "bug", "enhancement"]
  statusDefinitions: string[];   // ["open", "in-progress", "closed"]
  activeTaskType: string;
  visibleStatuses: string[];
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
  type: string;
  status: string;
  order: number;                 // Within (list, status) cell
  color?: string;
  createdAt: string;
  updatedAt: string;
}
```

Tasks are stored flat (sibling to lists) with a `listId` foreign key. This makes filtering by type/status a simple `.filter()` without nested traversal.

## On-Disk Storage

```
data/
  _index.json              # [{id, name, createdAt}]
  boards/
    {board-id}.json        # Full board document (lists + tasks)
```

One JSON file per board. Cursor can open any board file and read all tasks directly. The `_index.json` gives a table of contents.

## API Routes

Five thin routes — the server is purely a file I/O proxy with no business logic.


| Method | Endpoint                 | Action                               |
| ------ | ------------------------ | ------------------------------------ |
| GET    | `/api/boards`            | List all boards (from `_index.json`) |
| POST   | `/api/boards`            | Create board, write new file         |
| GET    | `/api/boards/:id`        | Read board JSON from disk            |
| PUT    | `/api/boards/:id`        | Overwrite board JSON to disk         |
| DELETE | `/api/boards/:id`        | Remove board file + index entry      |
| GET    | `/api/boards/:id/export` | Export with `?format=md              |


All routes defined in `src/server/routes/`. The storage layer in `src/server/storage.ts` handles atomic file writes (write to temp then rename).

## UI Component Tree

```mermaid
graph TD
  App --> BoardSelector
  App --> BoardView

  BoardView --> BoardToolbar
  BoardView --> MatrixGrid

  BoardToolbar --> TypeModeSwitcher
  BoardToolbar --> StatusFilter
  BoardToolbar --> ExportMenu
  BoardToolbar --> BoardSettings

  MatrixGrid --> StatusRow
  StatusRow --> Cell
  Cell --> TaskCard

  TaskCard --> MarkdownPreview
  TaskCard -->|"click"| TaskEditor
  TaskEditor --> MarkdownEditor
```



### Matrix rendering logic

The core board is a CSS Grid. Columns = lists, rows = visible statuses. Each cell shows tasks matching `(listId, status, activeTaskType)`.

```typescript
visibleStatuses.map(status =>
  board.lists.map(list =>
    tasks.filter(t =>
      t.type === activeTaskType &&
      t.listId === list.id &&
      t.status === status
    ).sort(byOrder)
  )
)
```

CSS: `grid-template-columns: auto repeat(N, 1fr)` where first column is the status label and N = number of lists.

## Drag & Drop Strategy

Using @dnd-kit with `DndContext` at the `MatrixGrid` level:

- **List reorder**: Horizontal drag of list column headers. Updates `list.order` for all affected lists.
- **Task reorder within cell**: Vertical sort within a `SortableContext` per cell.
- **Task move across cells**: Drop on a different cell changes `task.listId` and/or `task.status`. Custom collision detection to identify the target cell.

All DnD handlers live in `src/client/hooks/useDragHandlers.ts`. On drop, Zustand updates optimistically, then a mutation fires to persist.

## Project File Structure

```
taskmanager/
  package.json
  bunfig.toml
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
  components.json                    # shadcn/ui config
  src/
    shared/
      models.ts                      # Board, List, Task types
    server/
      index.ts                       # Hono app entry
      routes/
        boards.ts
        export.ts
      storage.ts                     # Atomic JSON file read/write
    client/
      main.tsx
      App.tsx
      api/
        queries.ts                   # TanStack Query hooks
        mutations.ts                 # Optimistic update mutations
      store/
        board-ui.ts                  # Zustand: active type, visible statuses
      components/
        layout/
          AppShell.tsx
          Sidebar.tsx                # Board list + create
        board/
          BoardView.tsx
          BoardToolbar.tsx
          MatrixGrid.tsx
          StatusRow.tsx
          Cell.tsx
          TypeModeSwitcher.tsx
          StatusFilter.tsx
        task/
          TaskCard.tsx
          TaskEditor.tsx             # Modal with markdown editor
        list/
          ListHeader.tsx
          ListSettings.tsx
        shared/
          MarkdownViewer.tsx
          ColorPicker.tsx
          ExportDialog.tsx
      hooks/
        useBoard.ts
        useDragHandlers.ts
  data/                              # Created at runtime
    _index.json
    boards/
```

## Implementation Order

Work proceeds bottom-up: shared types, then server, then core UI, then interactive features, then polish.