---
name: TaskManager Board App
overview: Build a browser-based, local-only task board app with a Bun + Hono backend serving a React 19 SPA, organized in 11 incremental phases -- from project scaffolding through advanced features and final polish.
todos:
  - id: p1-bun-init
    content: "Phase 1: bun init, install all dependencies (React 19, Vite 6, Hono, Tailwind 4, shadcn/ui, Zustand, TanStack Query, @dnd-kit, markdown libs, nanoid)"
    status: pending
  - id: p1-vite-config
    content: "Phase 1: Configure vite.config.ts with React plugin and API proxy to Hono dev server"
    status: pending
  - id: p1-ts-tailwind
    content: "Phase 1: Configure tsconfig.json (path aliases, strict) and Tailwind CSS 4 + shadcn/ui components.json"
    status: pending
  - id: p1-shared-types
    content: "Phase 1: Create src/shared/models.ts with Board, List, Task interfaces and default task types/statuses"
    status: pending
  - id: p1-server-entry
    content: "Phase 1: Create src/server/index.ts -- minimal Hono app with GET /api/health"
    status: pending
  - id: p1-client-entry
    content: "Phase 1: Create src/client/main.tsx + App.tsx -- minimal React render"
    status: pending
  - id: p1-verify
    content: "Phase 1: Verify bun run dev starts Vite + Hono and the proxy works end-to-end"
    status: pending
  - id: p2-storage
    content: "Phase 2: Build src/server/storage.ts -- atomic JSON read/write, ensure data/ directories on startup"
    status: pending
  - id: p2-routes
    content: "Phase 2: Build src/server/routes/boards.ts -- GET/POST /api/boards, GET/PUT/DELETE /api/boards/:id"
    status: pending
  - id: p2-wire-routes
    content: "Phase 2: Wire board routes into src/server/index.ts"
    status: pending
  - id: p2-queries
    content: "Phase 2: Build src/client/api/queries.ts -- TanStack Query hooks useBoards() and useBoard(id)"
    status: pending
  - id: p2-mutations
    content: "Phase 2: Build src/client/api/mutations.ts -- useCreateBoard, useUpdateBoard, useDeleteBoard with optimistic updates"
    status: pending
  - id: p2-appshell
    content: "Phase 2: Build AppShell.tsx -- layout shell with sidebar slot and main content area"
    status: pending
  - id: p2-sidebar
    content: "Phase 2: Build Sidebar.tsx -- board list, New Board button, active highlight, delete action"
    status: pending
  - id: p2-boardview
    content: "Phase 2: Build BoardView.tsx placeholder showing loaded board name"
    status: pending
  - id: p2-routing
    content: "Phase 2: Simple state-based routing to track selected board id"
    status: pending
  - id: p3-listheader
    content: "Phase 3: Build ListHeader.tsx -- list name, inline rename, delete button"
    status: pending
  - id: p3-new-list
    content: "Phase 3: Add New List button to BoardView"
    status: pending
  - id: p3-list-mutations
    content: "Phase 3: Add list mutations -- useCreateList, useRenameList, useDeleteList"
    status: pending
  - id: p3-matrix-skeleton
    content: "Phase 3: Build MatrixGrid.tsx skeleton -- CSS Grid with one column per list"
    status: pending
  - id: p3-cell
    content: "Phase 3: Build Cell.tsx as empty placeholder"
    status: pending
  - id: p3-statusrow
    content: "Phase 3: Build StatusRow.tsx as a single default row"
    status: pending
  - id: p4-taskcard
    content: "Phase 4: Build TaskCard.tsx -- compact card with title and body preview"
    status: pending
  - id: p4-taskeditor
    content: "Phase 4: Build TaskEditor.tsx modal -- title, body textarea, type select, status select"
    status: pending
  - id: p4-task-mutations
    content: "Phase 4: Add task mutations -- useCreateTask, useUpdateTask, useDeleteTask"
    status: pending
  - id: p4-add-task-btn
    content: "Phase 4: Add 'Add Task' button inside each Cell.tsx"
    status: pending
  - id: p4-render-tasks
    content: "Phase 4: Render tasks in cells filtered by (listId, status)"
    status: pending
  - id: p4-zustand-store
    content: "Phase 4: Build src/client/store/board-ui.ts Zustand store with activeTaskType and visibleStatuses"
    status: pending
  - id: p5-type-switcher
    content: "Phase 5: Build TypeModeSwitcher.tsx -- tab bar of board taskTypes"
    status: pending
  - id: p5-wire-filter
    content: "Phase 5: Wire activeTaskType from Zustand to matrix cell filter logic"
    status: pending
  - id: p5-toolbar
    content: "Phase 5: Build BoardToolbar.tsx container bar, embed TypeModeSwitcher"
    status: pending
  - id: p5-persist-type
    content: "Phase 5: Persist activeTaskType to board JSON on change"
    status: pending
  - id: p6-status-filter
    content: "Phase 6: Build StatusFilter.tsx -- toggle list of statusDefinitions"
    status: pending
  - id: p6-wire-statuses
    content: "Phase 6: Wire visibleStatuses from Zustand to matrix rendering"
    status: pending
  - id: p6-status-rows
    content: "Phase 6: Update MatrixGrid to render one StatusRow per visible status with label column"
    status: pending
  - id: p6-persist-statuses
    content: "Phase 6: Embed StatusFilter in BoardToolbar and persist visibleStatuses to board JSON"
    status: pending
  - id: p7-export-route
    content: "Phase 7: Build src/server/routes/export.ts -- GET /api/boards/:id/export with format and filter params"
    status: pending
  - id: p7-md-formatter
    content: "Phase 7: Server-side Markdown formatter for board export"
    status: pending
  - id: p7-export-dialog
    content: "Phase 7: Build ExportDialog.tsx -- format selector, filter options, download trigger"
    status: pending
  - id: p7-toolbar-export
    content: "Phase 7: Embed ExportMenu trigger in BoardToolbar"
    status: pending
  - id: p8-board-settings
    content: "Phase 8: Build BoardSettings.tsx -- rename, manage types/statuses, toggle counts, background image URL"
    status: pending
  - id: p8-background
    content: "Phase 8: Apply board background image as CSS background on BoardView"
    status: pending
  - id: p8-counts
    content: "Phase 8: Render count badges on list headers and status row labels"
    status: pending
  - id: p9-md-editor
    content: "Phase 9: Replace textarea with @uiw/react-md-editor in TaskEditor"
    status: pending
  - id: p9-md-viewer
    content: "Phase 9: Build MarkdownViewer.tsx with react-markdown for card preview"
    status: pending
  - id: p9-task-color
    content: "Phase 9: Build ColorPicker.tsx, add to TaskEditor, apply color on TaskCard"
    status: pending
  - id: p9-dnd-within
    content: "Phase 9: Implement @dnd-kit task reorder within a cell (SortableContext per cell)"
    status: pending
  - id: p9-dnd-across
    content: "Phase 9: Implement @dnd-kit cross-cell task movement (change listId/status)"
    status: pending
  - id: p9-drag-handlers
    content: "Phase 9: Build useDragHandlers.ts and wrap MatrixGrid in DndContext"
    status: pending
  - id: p10-list-color
    content: "Phase 10: Add accent color to ListHeader (color dot or header border)"
    status: pending
  - id: p10-list-settings
    content: "Phase 10: Build ListSettings.tsx popover to set list color"
    status: pending
  - id: p10-list-dnd
    content: "Phase 10: Implement @dnd-kit horizontal drag for list column reordering"
    status: pending
  - id: p11-empty-states
    content: "Phase 11: Empty states for no boards, no lists, no tasks"
    status: pending
  - id: p11-responsive
    content: "Phase 11: Responsive layout -- collapse sidebar, horizontal scroll for many lists"
    status: pending
  - id: p11-a11y
    content: "Phase 11: Keyboard accessibility -- focus management, escape to close modals"
    status: pending
  - id: p11-loading-error
    content: "Phase 11: Loading and error states for all async operations"
    status: pending
  - id: p11-visual-pass
    content: "Phase 11: Final spacing, typography, and color consistency pass"
    status: pending
isProject: false
---

# TaskManager — Local Board App (Phased)

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono (serves API + static SPA build)
- **Frontend**: React 19 + TypeScript
- **Build**: Vite 6
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Client state**: Zustand (UI prefs — active type, visible statuses)
- **Server state**: TanStack Query v5 (caching, optimistic updates)
- **Drag and Drop**: @dnd-kit
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

Five thin routes -- the server is purely a file I/O proxy with no business logic.

- **GET** `/api/boards` -- List all boards (from `_index.json`)
- **POST** `/api/boards` -- Create board, write new file
- **GET** `/api/boards/:id` -- Read board JSON from disk
- **PUT** `/api/boards/:id` -- Overwrite board JSON to disk
- **DELETE** `/api/boards/:id` -- Remove board file + index entry
- **GET** `/api/boards/:id/export` -- Export with `?format=md|json` and optional type/status filters

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

---

## Phased Implementation

Each phase builds on the previous one. At the end of every phase the app should be runnable and testable.

---

### Phase 1 -- Bootstrapping

Set up the project skeleton so that `bun run dev` starts a working Vite dev server proxied to a Hono backend that returns an empty JSON response.

- `bun init`, install all runtime and dev dependencies
- Configure `vite.config.ts` (React plugin, API proxy to Hono)
- Configure `tsconfig.json` (path aliases, strict mode)
- Configure Tailwind CSS 4 + shadcn/ui (`components.json`)
- Create `src/shared/models.ts` with `Board`, `List`, `Task` interfaces and default type/status constants
- Create `src/server/index.ts` -- minimal Hono app that responds to `GET /api/health`
- Create `src/client/main.tsx` + `App.tsx` -- minimal React render with "Hello TaskManager"
- Verify `bun run dev` starts both Vite and Hono and the proxy works

---

### Phase 2 -- Basic Boards

CRUD for boards (server + client). The user can create, rename, open, switch, and delete boards via a sidebar.

- Build `src/server/storage.ts` -- atomic JSON read/write helpers, ensure `data/` and `data/boards/` directories on startup
- Build `src/server/routes/boards.ts` -- GET/POST `/api/boards`, GET/PUT/DELETE `/api/boards/:id`
- Wire routes into `src/server/index.ts`
- Build `src/client/api/queries.ts` -- TanStack Query hooks for `useBoards()` and `useBoard(id)`
- Build `src/client/api/mutations.ts` -- `useCreateBoard`, `useUpdateBoard`, `useDeleteBoard` with optimistic updates
- Build `AppShell.tsx` -- layout shell with sidebar slot and main content area
- Build `Sidebar.tsx` -- board list, "New Board" button, active board highlight, delete action
- Build `BoardView.tsx` -- placeholder that shows the loaded board name when selected
- Simple state-based routing (Zustand or URL hash) to track selected board id

---

### Phase 3 -- Empty Lists

Lists appear as columns inside a board. No tasks yet -- just list headers with create/rename/delete.

- Build `ListHeader.tsx` -- displays list name, inline rename on double-click, delete button
- Add "New List" button to `BoardView.tsx` (or toolbar area)
- Add list mutations to `mutations.ts` -- `useCreateList`, `useRenameList`, `useDeleteList`
- Build initial `MatrixGrid.tsx` skeleton -- CSS Grid that renders one column per list (headers only, empty cells below)
- Build `Cell.tsx` as an empty drop zone placeholder
- Build `StatusRow.tsx` as a single default row (all statuses visible = one row for now)

---

### Phase 4 -- Basic Tasks

Users can create, view, edit, and delete tasks. Tasks appear inside the correct cell of the matrix.

- Build `TaskCard.tsx` -- compact card showing title and a truncated body preview
- Build `TaskEditor.tsx` -- modal/dialog with fields: title (input), body (textarea for now), type (select), status (select)
- Add task mutations -- `useCreateTask`, `useUpdateTask`, `useDeleteTask`
- Add "Add Task" button inside each `Cell.tsx`
- Render tasks inside cells by filtering `board.tasks` by `(listId, status)` (show all types for now)
- Build `src/client/store/board-ui.ts` -- Zustand store with `activeTaskType` and `visibleStatuses` state

---

### Phase 5 -- Task Type Filtering

The board-level type switcher filters which tasks are visible across all lists.

- Build `TypeModeSwitcher.tsx` -- tab bar or segmented control showing board's `taskTypes`
- Wire `activeTaskType` from Zustand store to the matrix filter logic
- Update `MatrixGrid.tsx` cell rendering to filter by `t.type === activeTaskType`
- Build `BoardToolbar.tsx` as the container bar above the grid, embed `TypeModeSwitcher`
- Persist `activeTaskType` back to the board JSON on change (via `useUpdateBoard`)

---

### Phase 6 -- Task Status Breakdown

Status rows split the board vertically. Users can toggle which statuses are visible.

- Build `StatusFilter.tsx` -- checkbox/toggle list of `board.statusDefinitions`
- Wire `visibleStatuses` from Zustand store to the matrix rendering
- Update `MatrixGrid.tsx` to render one `StatusRow` per visible status
- Add status label column (first column of the CSS Grid) showing the status name per row
- Embed `StatusFilter` in `BoardToolbar`
- Persist `visibleStatuses` back to the board JSON on change

---

### Phase 7 -- Export

Export the current board (or filtered view) as Markdown or JSON.

- Build `src/server/routes/export.ts` -- `GET /api/boards/:id/export?format=md|json&type=X&status=Y`
- Server-side Markdown formatter: board name, then per-list sections, then per-status task bullets
- Build `ExportDialog.tsx` -- format selector (md/json), optional type and status filters, download button
- Embed `ExportMenu` trigger in `BoardToolbar`
- Wire download to fetch the export endpoint and trigger a file save

---

### Phase 8 -- Advanced Board

Board-level settings panel and visual enhancements.

- Build `BoardSettings.tsx` -- dialog/drawer with:
  - Rename board
  - Manage task types (add/remove)
  - Manage status definitions (add/remove)
  - Toggle `showCounts`
  - Set background image URL
- Apply board background image as a CSS background on `BoardView`
- Render count badges on list headers (task count per list for active type)
- Render count badges on status row labels (task count per status for active type)

---

### Phase 9 -- Advanced Tasks

Rich markdown editing, task colors, and drag-and-drop for tasks.

- Replace plain textarea in `TaskEditor` with `@uiw/react-md-editor`
- Build `MarkdownViewer.tsx` using `react-markdown` for card preview
- Build `ColorPicker.tsx` and add it to `TaskEditor` for per-task color
- Apply task color as a left-border or background tint on `TaskCard`
- Implement @dnd-kit for task reorder within a cell (`SortableContext` per cell)
- Implement @dnd-kit cross-cell task movement (changes `listId` and/or `status`)
- Build `src/client/hooks/useDragHandlers.ts` with optimistic reorder logic
- Wrap `MatrixGrid` in `DndContext`

---

### Phase 10 -- Advanced Lists

List visual customization and drag-and-drop column reordering.

- Add accent color field to `ListHeader` (small color dot or header border)
- Build `ListSettings.tsx` -- popover to set list color
- Implement @dnd-kit horizontal drag for list column reordering
- Update `list.order` for all affected lists on drop and persist

---

### Phase 11 -- Polish

Final visual refinements and edge-case handling.

- Empty states: no boards, no lists, no tasks in a cell
- Responsive layout: collapse sidebar on small screens, horizontal scroll for many lists
- Keyboard accessibility: focus management in modals, escape to close
- Loading and error states for all async operations
- Final spacing, typography, and color consistency pass
