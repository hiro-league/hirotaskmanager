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

## Phase 2: Optimizations (ranked by profiled impact)

Rankings updated after Phase 1 profiling. See `docs/profiling-analysis.md` for full data. Profiling measured a 1000-task board in stacked layout across five scenarios: load, hover, scroll, drag-and-drop, and filter toggle.

### 1. Ref-ify BoardKeyboardNavProvider state — critical quick win

**Profiled impact:** Eliminates the single biggest source of unnecessary re-renders. `BoardKeyboardNavProvider` is the sole updater in 100% of hover commits (20/20), 100% of scroll commits (7/7 meaningful), and the top 8 drag commits. Each state change triggers a full re-render of all 1000 tasks (18,000 `SortableTaskRow` samples in a 20-commit hover session). Effect re-runs from these unnecessary renders cost more than the renders themselves (27,839 ms effects vs 10,720 ms commits during hover).

**Problem:** `SortableTaskRow.onPointerEnter` → `setHoveredTaskId` (useState) in `BoardKeyboardNavContext` → re-render of context provider + all consumers. Moving the mouse across cards fires this on every card boundary. Scrolling also triggers this — 7 of 10 scroll commits come from `BoardKeyboardNavProvider`, likely via intersection observers or scroll-position-based hover events.

**Fix:** Store `hoveredTaskId` in a `ref` instead of state. Only promote to state when the keyboard system actually consumes it (Tab / arrow key pressed). Audit all `BoardKeyboardNavContext` state to check whether scroll-triggered updates (e.g. `focusedTaskId`, element registrations) also use state where a ref would suffice.

**Files:** `BoardKeyboardNavContext.tsx`, `SortableTaskRow.tsx`.

**Effort:** Low.

### 2. Stop passing full `board` as prop / enable memoization — critical

**Profiled impact:** Zero components in the tree successfully bail out of rendering today. Every commit re-renders the full cascade: `BoardColumnsStacked` → `BoardListStackedColumn ×50` → `ListStackedBody ×50` → `StackedSortableList ×50` → `SortableTaskRow ×1000` → `TaskCard ×1000`. Without this fix, any remaining re-render source (Radix UI cascades during filter toggle — 26 commits at 617 ms each, BoardView updates on data refetch) still re-renders all 1000 tasks.

**Problem:** `board` is a new object reference on every React Query cache update. Every component receiving `board` as a prop re-renders even if its own list's tasks haven't changed. `React.memo` on `ListStatusBand` / `BoardListColumn` / `SortableBandContent` cannot help because the top-level prop always changes.

**Fix:** At the `BoardColumns` / `BoardColumnsStacked` level, derive stable per-band slices:
- `taskGroups`, `taskPriorities` (stable references unless edited)
- Pre-indexed task array for this specific `(listId, status)` (from optimization #3)
- Pass these slices instead of `board`

Alternatively, put the board data in a context or Zustand slice with selector-based access so child components subscribe only to the fields they need.

**Files:** `BoardColumns.tsx`, `BoardColumnsStacked.tsx`, `BoardListColumn.tsx`, `BoardListStackedColumn.tsx`, `ListStatusBand.tsx`.

**Effort:** Medium. Depends on #3 for stable slices.

### 3. Pre-index tasks by (listId, status) — enabler for #2

**Profiled impact:** Not directly measurable in isolation (filter/sort cost is dwarfed by the render cascade), but this is a prerequisite for #2 — it produces the stable per-band task arrays that make `React.memo` on column/band components possible.

**Problem:** `listStatusTasksSorted` scans the full `board.tasks` array for every `(listId, status)` band. With N tasks and B bands this is O(N × B) per render.

**Fix:** Build a single `Map<string, Task[]>` keyed by `` `${listId}:${status}` `` once, memoized on `board.tasks` reference identity, at the `BoardColumns` / `BoardColumnsStacked` level. Each band does an O(1) lookup then filters only its own subset by group/priority/date. `buildLanesTaskContainerMap` and `buildStackedTaskContainerMap` use the same index.

**Files:** `boardStatusUtils.ts`, `useLanesBoardDnd.ts`, `useStackedBoardDnd.ts`, `ListStatusBand.tsx`, `BoardListStackedColumn.tsx`.

**Effort:** Low.

### 4. Virtualize task lists — highest impact on load, highest complexity

**Profiled impact:** The fundamental fix for load time. A single 14,703 ms RunTask blocks the main thread during initial render. 9,344 ms of GC (5,176 slices, including a MajorGC reclaiming 145 MB → 25 MB) and 17,878 dirty layout objects confirm massive object churn from mounting 1000 components. Virtualization also slashes DnD collision scope by reducing registered sortables from 1000 to ~50 visible, and eliminates most of the 89.6 ms IntersectionObserver overhead during drag.

**Problem:** Every task is a mounted React component with a `useSortable` hook, a `registerTaskElement` call, and full DOM subtree. This is the root cause of slow initial render, high memory usage, and sluggish scroll/hover/drag.

**Fix:** Use `@tanstack/react-virtual` to render only tasks visible in each band's scroll viewport (+ overscan buffer of ~5 items). Tasks outside the viewport are unmounted.

Key design decisions:
- The DnD container map must still know about all task IDs (for correct ordering on drop), but only visible tasks register as sortable DOM nodes.
- `registerTaskElement` only tracks visible tasks; keyboard arrow navigation scrolls the virtualizer to bring the target task into view before registering it.
- The drag overlay renders a standalone `TaskCard` (already the case), so the dragged item doesn't need to be in the virtualized list.
- Stacked layout (primary): each `BoardListStackedColumn` gets its own virtualizer instance.
- Lanes layout: each `ListStatusBand` gets its own virtualizer instance.

**Files:** `ListStatusBand.tsx`, `BoardListStackedColumn.tsx`, `SortableTaskRow.tsx`, `BoardKeyboardNavContext.tsx`, new `useVirtualizedBand.ts` hook.

**Effort:** High. Benefits from #1, #2, #3 being done first (clean prop flow, fewer spurious re-renders to interact with virtualizer).

### 5. Reduce DnD collision detection scope — high DnD-specific impact

**Profiled impact:** DnD layout thrashing is severe and unique to this scenario: 2,404.6 ms in layout/paint (40× more than scroll, 16× more than filter toggle). `UpdateLayoutTree` slices of 380.9 ms and 347.1 ms touch 15,253 elements — forced style recalculation from dnd-kit reading sortable positions. The initial pointerdown event blocks for 4,223 ms (snapshot all sortable positions + re-render + overlay layout). Each subsequent pointermove blocks for 1,297 ms. `IntersectionObserverController::computeIntersections` adds 89.6 ms across 37 calls during drag.

**Problem:** dnd-kit evaluates collision detection against all registered sortable/droppable nodes. With 1000 sortable tasks, every `onDragOver` event runs collision checks against all of them.

**Fix:**
- Use a custom collision detection strategy that only checks containers geometrically near the pointer (spatial partitioning).
- Virtualization (#4) helps by reducing registered sortables, but a custom strategy is needed even with virtualization to avoid reading positions of all ~50 visible sortables on every move event.
- Consider pausing intersection observers during active drag — 89.6 ms in `IntersectionObserverController::computeIntersections` is non-trivial.
- As an intermediate step, consider disabling sortable registration for tasks outside the currently-dragged-over list.

**Files:** `BoardColumns.tsx`, `BoardColumnsStacked.tsx`, dnd hook files, potentially a new `collisionStrategy.ts`.

**Effort:** Medium.

### 6. Lazy-mount Popper/Presence on list headers — load quick win (new)

**Profiled impact:** The second-heaviest load commit (854 ms, fiber sum 16,759 ms) is triggered by `ListStackedBody×50, Popper×50, Presence×50`. Each of the 50 list sections eagerly mounts a dropdown menu (Popper) and animation wrapper (Presence), triggering a full re-render cascade. Eliminating these saves ~854 ms on load and avoids 100 unnecessary component mounts.

**Problem:** List header dropdown menus are mounted on initial render even though the user hasn't interacted with any of them. Each Popper + Presence pair triggers effects and state changes that cascade into re-renders.

**Fix:** Render list header dropdown menus lazily — only mount the Popper/Presence wrapper on first open. Use a simple `wasOpened` state gate or render `null` for the popover content until the trigger is first clicked.

**Files:** `ListHeader.tsx` (or wherever the list header dropdown is defined).

**Effort:** Low.

### 7. Trim task body from board payload — server-side win

**Profiled impact:** Indirectly confirmed by load-time GC data (MajorGC reclaims 145 MB → 25 MB), but payload size was not directly measured. Reducing payload size will shorten network transfer, JSON parse time, and initial GC pressure. Hard to quantify without measuring actual payload size — worth checking the network tab before implementing.

**Problem:** `GET /api/boards/:id` sends full `task.body` for every task. The board view only uses a 100-char preview (`previewBody` in `TaskCard.tsx`). With 1000 tasks this can be megabytes of unused text.

**Fix:** Add a query parameter (e.g. `?slim=1` or `?bodyPreview=120`) to the board endpoint. When set, the server truncates each task's body to the preview length before serializing. Full body is fetched on-demand when the task editor opens (already has `GET /api/boards/:id/tasks/:taskId`).

**Files:** `boards.ts` (server route), `board.ts` (storage — `loadBoard`), `queries.ts` (client fetch).

**Effort:** Low-medium.

### 8. Cheaper container map signature — minor win

**Profiled impact:** Not directly measurable from current data. Lower priority than all other items.

**Problem:** `tasksLayoutSig` in `useLanesBoardDnd.ts` builds a string by mapping all tasks and joining. `serializeTaskContainerMap` does similar work. With 1000 tasks these string operations are non-trivial.

**Fix:** Replace string concatenation with a numeric hash or use `board.updatedAt` + task count as the cache key. For `serializeTaskContainerMap`, compare by iterating keys and arrays directly instead of building a full string.

**Files:** `useLanesBoardDnd.ts`, `useStackedBoardDnd.ts`, `useBoardTaskDndReact.ts`.

**Effort:** Low.

---

## Execution order

| Step | Item | Effort | Prerequisite |
|------|------|--------|-------------|
| 1 | ~~Phase 1 profiling (steps 1–4)~~ | ✅ Done | — |
| 2 | Ref-ify BoardKeyboardNavProvider state (#1) | Low | None |
| 3 | Pre-index tasks by (listId, status) (#3) | Low | None |
| 4 | Lazy-mount Popper/Presence on list headers (#6) | Low | None |
| 5 | Stop passing full `board` as prop (#2) | Medium | #3 (uses pre-indexed slices) |
| 6 | Trim body from payload (#7) | Low-med | None |
| 7 | Cheaper container map signature (#8) | Low | None |
| 8 | Virtualize task lists (#4) | High | #2, #3, #5 (clean prop flow first) |
| 9 | Reduce DnD collision scope (#5) | Medium | Profiling data; pairs well with #8 |

Steps 2–4 and 6–7 are independent quick wins that can be done in parallel. Step 5 depends on #3 for stable slices. Steps 8–9 are the heavy hitters that benefit from the cleaner architecture established by earlier steps.

Re-profile after each step to measure actual improvement and validate the estimated savings.

## Success criteria (with measured baselines)

| Metric | Baseline (profiled) | Target |
|--------|-------------------|--------|
| Board load (longest RunTask) | 14,703 ms | < 2,000 ms |
| Load GC wall time | 9,344 ms | < 500 ms |
| Load layout dirty objects | 17,878 | < 2,000 |
| Hover per-commit duration | 536–637 ms | < 16 ms (one frame) |
| Hover commits per 10 cards | 20 | 0 (or 1–2 if keyboard active) |
| Scroll longest RunTask | 4,285 ms | < 16 ms |
| Drag pointerdown block | 4,223 ms | < 200 ms |
| Drag pointermove block | 1,297 ms | < 50 ms |
| DnD UpdateLayoutTree max | 380.9 ms | < 16 ms |
| Filter toggle total commit time | 13,895 ms | < 200 ms |
| DOM node count (1000-task board) | ~17,000+ (estimated from layout data) | 70%+ reduction after virtualization |
