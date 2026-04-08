# Board performance — optimization plan

Addresses sluggish board interaction when list/task counts grow (tested with 1000 tasks: 10+ second load, laggy hover, scroll, drag-and-drop, and filtering).

## Problem statement

The board view renders every task as a real DOM node with a full `useSortable` hook registration, no virtualization, and no pagination. The server sends the entire board payload (all lists, all tasks with full body text) in a single JSON response. On the client:

- **Initial render** mounts 1000+ `SortableTaskRow` components, each registering a dnd-kit sortable sensor and a keyboard-nav DOM element reference. This produces 10,000–30,000+ DOM nodes.
- **Hover** fires `setHoveredTaskId` (React state) on every `pointerenter`, causing context re-renders across the board.
- **Filtering/sorting** runs `board.tasks.filter().sort()` independently in every `ListStatusBand` — with 5 lists × 3 statuses that's 15× full-array scans per render cycle.
- **Drag-over** triggers dnd-kit collision detection against all registered sortables and rebuilds the container map string signature on each event.
- **Board prop propagation** — the `board` object is a new reference on every React Query refetch or optimistic update, defeating `React.memo` on child components that receive it.

Primary layout: **stacked** (single column per list). Lanes layout is secondary. Browser target: **Chrome**. Acceptable trade-off: off-screen tasks may not be instantly keyboard-navigable (must scroll into view first).

## Phase 1: Profiling

Measure before optimizing. Use the existing task generator script to create a board with 1000 tasks.

### Step 1 — React DevTools Profiler

1. Open the 1000-task board in Chrome with React DevTools installed.
2. Record a Profiler session covering each scenario:
   - Initial board load/render
   - Scrolling inside a list
   - Hovering over task cards (move mouse across 10+ cards)
   - Dragging a task (start → drag-over several containers → drop)
   - Toggling a filter (group or priority)
3. Export the Profiler trace (`.json`).
4. Identify: which components re-render most, which renders take longest, what triggers them.

### Step 2 — Chrome Performance flame chart

1. Open Chrome DevTools → Performance tab.
2. Record the same five scenarios.
3. Look for:
   - Long tasks (>50 ms) during hover / scroll / drag
   - Layout thrashing (forced reflows from reading `offsetHeight` etc. during render)
   - Excessive GC pauses from short-lived array/string allocations
   - `useSortable` sensor overhead (pointer/intersection observers)

### Step 3 — Targeted instrumentation

Add temporary `performance.mark` / `performance.measure` calls in hot paths:

| Location | What to measure |
|----------|----------------|
| `listStatusTasksSorted` (`boardStatusUtils.ts`) | filter+sort time per band call |
| `buildLanesTaskContainerMap` / `buildStackedTaskContainerMap` | full container map rebuild time |
| `BoardColumns` / `BoardColumnsStacked` render body | total list render time |
| `SortableTaskRow` mount/unmount | count per drag-over event |
| `onDragOver` handler (`useBoardTaskDndReact.ts`) | per-event cost |
| `serializeTaskContainerMap` | string build time with 1000 tasks |

### Step 4 — DOM node count baseline

Run in console on the loaded board:

```js
document.querySelectorAll('*').length          // total DOM nodes
performance.memory?.usedJSHeapSize / 1e6       // heap MB (Chrome only)
```

Record baseline numbers before and after each optimization.

---

## Phase 2: Optimizations (ranked by expected impact)

### 1. Pre-index tasks by (listId, status) — quick win

**Problem:** `listStatusTasksSorted` scans the full `board.tasks` array for every `(listId, status)` band. With N tasks and B bands this is O(N × B) per render.

**Fix:** Build a single `Map<string, Task[]>` keyed by `` `${listId}:${status}` `` once, memoized on `board.tasks` reference identity, at the `BoardColumns` / `BoardColumnsStacked` level. Each band does an O(1) lookup then filters only its own subset by group/priority/date. `buildLanesTaskContainerMap` and `buildStackedTaskContainerMap` use the same index.

**Files:** `boardStatusUtils.ts`, `useLanesBoardDnd.ts`, `useStackedBoardDnd.ts`, `ListStatusBand.tsx`, `BoardListStackedColumn.tsx`.

**Effort:** Low.

### 2. Debounce / ref-ify hover state — quick win

**Problem:** `SortableTaskRow.onPointerEnter` → `setHoveredTaskId` (useState) in `BoardKeyboardNavContext` → re-render of context provider + all consumers. Moving the mouse across cards fires this on every card boundary.

**Fix:** Store `hoveredTaskId` in a `ref` instead of state. Only promote to state when the keyboard system actually consumes it (Tab / arrow key pressed). Alternatively, gate updates behind `requestAnimationFrame` so at most one state update fires per frame.

**Files:** `BoardKeyboardNavContext.tsx`, `SortableTaskRow.tsx`.

**Effort:** Low.

### 3. Trim task body from board payload — quick server win

**Problem:** `GET /api/boards/:id` sends full `task.body` for every task. The board view only uses a 100-char preview (`previewBody` in `TaskCard.tsx`). With 1000 tasks this can be megabytes of unused text.

**Fix:** Add a query parameter (e.g. `?slim=1` or `?bodyPreview=120`) to the board endpoint. When set, the server truncates each task's body to the preview length before serializing. Full body is fetched on-demand when the task editor opens (already has `GET /api/boards/:id/tasks/:taskId`).

**Files:** `boards.ts` (server route), `board.ts` (storage — `loadBoard`), `queries.ts` (client fetch).

**Effort:** Low-medium.

### 4. Stop passing full `board` as prop to band/column components — medium win

**Problem:** `board` is a new object reference on every React Query cache update. Every component receiving `board` as a prop re-renders even if its own list's tasks haven't changed. `React.memo` on `ListStatusBand` / `BoardListColumn` / `SortableBandContent` cannot help because the top-level prop always changes.

**Fix:** At the `BoardColumns` / `BoardColumnsStacked` level, derive stable per-band slices:
- `taskGroups`, `taskPriorities` (stable references unless edited)
- Pre-indexed task array for this specific `(listId, status)` (from optimization #1)
- Pass these slices instead of `board`

Alternatively, put the board data in a context or Zustand slice with selector-based access so child components subscribe only to the fields they need.

**Files:** `BoardColumns.tsx`, `BoardColumnsStacked.tsx`, `BoardListColumn.tsx`, `BoardListStackedColumn.tsx`, `ListStatusBand.tsx`.

**Effort:** Medium.

### 5. Reduce DnD collision detection scope — medium win

**Problem:** dnd-kit evaluates collision detection against all registered sortable/droppable nodes. With 1000 sortable tasks, every `onDragOver` event runs collision checks against all of them. This is the primary cause of drag-over sluggishness.

**Fix:**
- Use a custom collision detection strategy that only checks containers geometrically near the pointer (spatial partitioning).
- Ties into virtualization (#6): unmounted tasks have no sortable registration, so the active set shrinks automatically.
- As an intermediate step, consider disabling sortable registration for tasks outside the currently-dragged-over list.

**Files:** `BoardColumns.tsx`, `BoardColumnsStacked.tsx`, dnd hook files, potentially a new `collisionStrategy.ts`.

**Effort:** Medium.

### 6. Virtualize task lists — highest impact, highest complexity

**Problem:** Every task is a mounted React component with a `useSortable` hook, a `registerTaskElement` call, and full DOM subtree. This is the root cause of slow initial render, high memory usage, and sluggish scroll/hover/drag.

**Fix:** Use `@tanstack/react-virtual` to render only tasks visible in each band's scroll viewport (+ overscan buffer of ~5 items). Tasks outside the viewport are unmounted.

Key design decisions:
- The DnD container map must still know about all task IDs (for correct ordering on drop), but only visible tasks register as sortable DOM nodes.
- `registerTaskElement` only tracks visible tasks; keyboard arrow navigation scrolls the virtualizer to bring the target task into view before registering it.
- The drag overlay renders a standalone `TaskCard` (already the case), so the dragged item doesn't need to be in the virtualized list.
- Stacked layout (primary): each `BoardListStackedColumn` gets its own virtualizer instance.
- Lanes layout: each `ListStatusBand` gets its own virtualizer instance.

**Files:** `ListStatusBand.tsx`, `BoardListStackedColumn.tsx`, `SortableTaskRow.tsx`, `BoardKeyboardNavContext.tsx`, new `useVirtualizedBand.ts` hook.

**Effort:** High.

### 7. Cheaper container map signature — minor win

**Problem:** `tasksLayoutSig` in `useLanesBoardDnd.ts` builds a string by mapping all tasks and joining. `serializeTaskContainerMap` does similar work. With 1000 tasks these string operations are non-trivial.

**Fix:** Replace string concatenation with a numeric hash or use `board.updatedAt` + task count as the cache key. For `serializeTaskContainerMap`, compare by iterating keys and arrays directly instead of building a full string.

**Files:** `useLanesBoardDnd.ts`, `useStackedBoardDnd.ts`, `useBoardTaskDndReact.ts`.

**Effort:** Low.

---

## Execution order

| Step | Item | Effort | Prerequisite |
|------|------|--------|-------------|
| 1 | Phase 1 profiling (steps 1–4) | ~1 day | 1000-task board via generator |
| 2 | Pre-index tasks by (listId, status) | Low | None |
| 3 | Debounce hover state | Low | None |
| 4 | Trim body from payload | Low-med | None |
| 5 | Cheaper container map signature | Low | None |
| 6 | Stop passing full `board` as prop | Medium | #2 (uses pre-indexed slices) |
| 7 | Reduce DnD collision scope | Medium | Profiling data from #1 |
| 8 | Virtualize task lists | High | #2, #3, #6 (clean prop flow first) |

Steps 2–5 are independent quick wins that can be done in parallel. Step 6 builds on #2. Steps 7–8 benefit from profiling data and the cleaner prop architecture from earlier steps.

## Success criteria

- 1000-task board loads in < 2 seconds (currently 10+)
- Hover across 10 cards produces no visible lag or frame drops
- Drag-over between lists stays at 60 fps (or at least no perceptible stutter)
- Filter toggle re-renders in < 200 ms
- DOM node count on a 1000-task board drops by 70%+ (after virtualization)
