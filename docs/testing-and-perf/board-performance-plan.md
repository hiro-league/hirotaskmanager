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

### 1b. Decouple keyboard highlight visuals from React re-renders — follow-up to #1

**Profiled / observed impact:** After #1, hover no longer rebuilds the board, but keyboard navigation can still feel sluggish on wide boards (for example 50 lists in stacked view). Each left/right move updates `highlightedTaskId` / `highlightedListId` in `BoardKeyboardNavContext`, rebuilding the context value and forcing every mounted consumer to re-check whether it is highlighted. With horizontal column gating this is far better than before, but still unnecessary work for moving a single ring between two DOM nodes.

**Problem:** `TaskCard` reads `nav?.highlightedTaskId === task.id` and list columns read `nav?.highlightedListId === list.id` during render. Even though only one task/list gains focus and one loses it, every mounted task card / list shell subscribed to the context participates in the render pass. The follow-up `scrollIntoView()` / scroll nudging then adds forced layout work on top of that render cascade.

**Fix:** Keep the current highlighted task/list ids in refs inside `BoardKeyboardNavContext`, expose them through stable getters for imperative keyboard actions, and move the selection ring visually by updating the registered DOM nodes directly:
- remove ring classes from the previously highlighted element
- add ring classes to the newly highlighted element
- keep the existing reveal / scroll-into-view behavior for virtualized tasks and horizontally gated columns

This preserves the current keyboard UX while avoiding broad React re-renders just to move the highlight.

**Files:** `BoardKeyboardNavContext.tsx`, `TaskCard.tsx`, `BoardListColumn.tsx`, `BoardListStackedColumn.tsx`.

**Effort:** Medium.

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

**Fix:** Add a query parameter (e.g. `?slim=1` or `?bodyPreview=120`) to the board endpoint. When set, the server truncates each task's body to the preview length before serializing. Full body is fetched on-demand when the task editor opens (`GET /api/tasks/:taskId`).

**Files:** `boards.ts` (server route), `board.ts` (storage — `loadBoard`), `queries.ts` (client fetch).

**Effort:** Low-medium.

### 8. Cheaper container map signature — minor win

**Profiled impact:** Not directly measurable from current data. Lower priority than all other items.

**Problem:** `tasksLayoutSig` in `useLanesBoardDnd.ts` builds a string by mapping all tasks and joining. `serializeTaskContainerMap` does similar work. With 1000 tasks these string operations are non-trivial.

**Fix:** Replace string concatenation with a numeric hash or use `board.updatedAt` + task count as the cache key. For `serializeTaskContainerMap`, compare by iterating keys and arrays directly instead of building a full string.

**Files:** `useLanesBoardDnd.ts`, `useStackedBoardDnd.ts`, `useBoardTaskDndReact.ts`.

**Effort:** Low.

---

## Phase 2 execution status

| Step | Item | Effort | Status |
|------|------|--------|--------|
| 1 | ~~Phase 1 profiling (steps 1–4)~~ | — | ✅ Done |
| 2 | Ref-ify BoardKeyboardNavProvider state (#1) | Low | ✅ Done |
| 3 | Decouple keyboard highlight visuals from React re-renders (#1b) | Medium | ✅ Done |
| 4 | Pre-index tasks by (listId, status) (#3) | Low | ✅ Done |
| 5 | Lazy-mount Popper/Presence on list headers (#6) | Low | ✅ Done |
| 6 | Stop passing full `board` as prop (#2) | Medium | ✅ Done |
| 7 | Trim body from payload (#7) | Low-med | ✅ Done |
| 8 | Cheaper container map signature (#8) | Low | ✅ Done |
| 9 | Virtualize task lists (#4) + horizontal column gating | High | ✅ Done |
| 10 | Reduce DnD collision scope (#5) | Medium | ⬜ Not started |

All Phase 2 items are complete except #5 (custom DnD collision strategy). See `docs/performance-fixes.md` for implementation details of each fix.

---

## Phase 2.5: Post-optimization profiling results

Re-profiled the same 1000-task board (stacked layout, initial load) after completing Phase 2 fixes #1–#4, #6–#8 (all except DnD collision scope).

Data sources:

- `docs/profiling/new-first-load-profile-summary.txt` — React Profiler
- `docs/chrome-profiling/new-chrome-first-load-profile-summary.txt` — Chrome Performance trace

### Measured improvements vs. original baseline

| Metric | Original baseline | After Phase 2 | Change |
|--------|-------------------|---------------|--------|
| Longest RunTask (Chrome) | 14,703 ms | 7,445 ms | **−49%** |
| GC wall time | 9,344 ms (5,176 slices) | 3,828 ms (3,695 slices) | **−59%** |
| React total commit duration | 4,123–4,753 ms | 1,596 ms | **−63%** |
| Slowest single commit | 967 ms | 582 ms | **−40%** |
| Layout/effect duration (React) | 6,898–11,030 ms | 1,250 ms | **−82%** |
| Layout/paint (Chrome) | 535 ms | 649 ms | ~same |
| UpdateLayoutTree max | 235.6 ms | 161.5 ms | **−31%** |
| MinorGC events | 115 | 57 | **−50%** |
| MajorGC events | 11 | 5 | **−55%** |
| React commits (load) | 10–12 | 13 | ~same |

### What improved and why

1. **React commit duration dropped 63%** — `React.memo` on columns/bands (Fix #2) + pre-indexed tasks (Fix #3) means child components bail out of rendering when their own slice hasn't changed. Effect duration dropped 82% because fewer components re-render → fewer sortable/registration effects re-run.

2. **GC dropped 59%** — Slim payload (Fix #7) reduces the JSON parse + initial object graph. Virtualization (Fix #4) reduces mounted component count, cutting the hook/closure garbage from 1000 rows to ~80–100 visible rows.

3. **Longest RunTask cut in half** — Virtualization and column gating mean the initial synchronous render mounts ~6–8 visible columns × ~13 rows = ~80–100 task cards instead of 1000. The 7.4s RunTask is still React's `performWorkUntilDeadline` — a single unbroken synchronous render pass.

### What is still slow (new profiling bottlenecks)

1. **7.4-second monolithic RunTask** — The single biggest remaining problem. Even with virtualization reducing task rows to ~100, the initial render still mounts all 50 list column shells (header, scroll container, virtualizer, droppable, sortable column DnD) plus the full provider cascade. The 7.4s block is 100% synchronous React work with no yield points.

2. **GC still at 3.8s** — Better but still enormous. 57 MinorGC cycles averaging ~10ms each, plus 5 MajorGC cycles. Short-lived closures from hook registrations, `useMemo` recomputations, and dnd-kit internals across 50 columns accumulate fast.

3. **Provider cascade renders 5× at ~570ms** — `BoardView` → `ShortcutScopeProvider` → `BoardStatsDisplayProvider` → `BoardTaskKeyboardBridgeProvider` → `BoardKeyboardNavProvider` → `BoardColumnsStacked` → `DragDropProvider` all render at the same wall time because they are a synchronous chain wrapping the same children. Any state change in the cascade re-renders everything below.

4. **Second-heaviest commit: 454.8ms** — Updaters: `BoardColumnsStacked`, `BoardKeyboardNavProvider`, `BoardView`. Multiple providers triggering state changes during mount still cause a cascading re-render of the full board within the first render cycle.

5. **StackedSortableList×50 commit: 246.9ms** — All 50 lists register sortable instances, triggering a synchronous commit with 602ms of layout effects. This is dnd-kit sortable registration — each list column's body mounts its task droppable + sortable setup.

6. **ListStackedBody×50 + Popper×50 commit: 150.4ms** — Lazy emoji dropdown mount (Fix #6) reduced this from ~854ms but still shows 50 body mounts + 50 popper mounts as a synchronous block.

7. **EvaluateScript: 195.9ms** — Script parse/compile time is non-trivial. Included in the long RunTask; contributes to time-to-interactive.

---

## Phase 3: Next-wave optimizations (ranked by remaining bottleneck impact)

### 9. Chunked / progressive column mounting — break the 7.4s RunTask

**Remaining bottleneck:** The 7.4-second `performWorkUntilDeadline` is a single synchronous React render of all 50 column shells + their virtualizer internals + DnD registrations. The browser is completely frozen during this — no painting, no input handling. Virtualization cut the task-row count but all 50 column **shells** still mount synchronously.

**Problem:** `BoardColumnsStacked` maps over `localListIds` (50 items) in a single render pass. Each `BoardListStackedColumn` mounts: `ListHeader`, scroll container, `StackedSortableList` (virtualizer + droppable), column sortable (reorder DnD), keyboard-nav registration, and `useColumnInViewport` IO setup. Even with column gating, the shell + IO + DnD registration for 50 columns is expensive.

**Fix — progressive mount:** Render columns in chunks across multiple frames so the browser can paint and handle input between batches:

- **Option A — `startTransition` wrapping:** Wrap `BoardColumnsStacked` rendering in `React.startTransition`. React 18+ will yield between fibers during a transition, letting the browser paint partial progress. The board shows a skeleton or loading state initially and columns fill in progressively. Cheapest to implement but React controls the yielding cadence.

- **Option B — Explicit column chunking:** `BoardColumnsStacked` renders only the first N columns (N ≈ 6–8, enough to fill the visible viewport) on the first frame. Remaining columns mount in batches of 8–10 via `requestIdleCallback` or a micro-task queue. Each batch updates a `mountedColumnCount` state. Off-screen columns remain as width placeholders (empty `w-72` divs) until their batch runs, preserving horizontal scroll width.

- **Option C — `content-visibility: auto` on column shells:** CSS-level optimization. The browser can skip layout, paint, and render tree construction for off-screen column shells entirely. No React code changes needed for the deferred paint, but React still mounts all 50 components (so hook registration cost remains). Best used as a complement to Option A or B.

**Expected impact:** Break the 7.4s freeze into ~1–2s for initial visible content + background mount of remaining columns. User sees the first 6–8 columns within 1–2s instead of waiting 7.4s for all 50.

**Files:** `BoardColumnsStacked.tsx`, `BoardColumns.tsx`, potentially a new `useProgressiveMount.ts` hook.

**Effort:** Medium.

### 10. Deferred DnD sortable registration — eliminate mount-time sortable overhead

**Remaining bottleneck:** The `StackedSortableList×50` commit (246.9ms render + 602.3ms effects) is entirely dnd-kit sortable infrastructure mounting. Each visible task row registers as a sortable via `useSortable`, and each list body registers as a droppable. These hooks run `useLayoutEffect` to measure positions and set up intersection observers — all during the initial render cycle before the user has any intention to drag.

**Problem:** dnd-kit's sortable hooks are eager: they register sensors, measure element rects, and set up intersection observers immediately on mount. With ~80–100 visible task rows + 50 droppable containers, that's 130+ hook registrations running synchronously during mount.

**Fix:** Delay sortable/droppable registration until the user initiates a drag gesture:

- Mount task rows as plain (non-sortable) DOM nodes initially. Use a `dragEnabled` flag in a context or ref, defaulting to `false`.
- On `pointerdown` (drag activation threshold met), flip `dragEnabled` to `true` and trigger a targeted re-render that registers sortables for the relevant columns.
- Alternatively, use dnd-kit's `useDraggable` (lighter than `useSortable`) for mount and upgrade to full sortable only on drag start.

This trades a small delay on first drag initiation (single re-render of visible rows to register sortables) for eliminating ~850ms of mount-time work.

**Files:** `SortableTaskRow.tsx`, `StackedSortableList` (in `BoardListStackedColumn.tsx`), potentially `useBoardTaskContainerDroppableReact.ts`.

**Effort:** Medium-high. Requires careful interaction with dnd-kit's internal state management.

### 11. Flatten the provider cascade — reduce nesting tax

**Remaining bottleneck:** The profiler shows 5 nested providers (`ShortcutScopeProvider` → `BoardStatsDisplayProvider` → `BoardTaskKeyboardBridgeProvider` → `BoardKeyboardNavProvider` → `BoardTaskCompletionCelebrationProvider`) each rendering at ~570ms because they wrap the same children. Any state change in one triggers reconciliation of all descendants.

**Problem:** Each provider is a separate React component with its own state, effects, and context value. When any provider re-renders (even if only its own context value changed), React must reconcile the entire subtree below it. With deeply nested providers, a state change near the top forces the reconciler to walk through every intermediate provider before reaching the actual board content.

**Fix:**

- **Merge lightweight providers:** `ShortcutScopeProvider`, `BoardStatsDisplayProvider`, and `BoardTaskCompletionCelebrationProvider` are thin wrappers. Combine them into a single `BoardServicesProvider` that exposes multiple contexts from one component. This reduces the nesting depth from 5 to 2–3 providers.
- **Stabilize context values aggressively:** Ensure every context `value` prop is memoized with correct dependencies so React's bailout optimization can skip re-rendering children when the context value is referentially stable.
- **Consider context selectors:** For `BoardKeyboardNavContext`, which is the most complex provider, use a library like `use-context-selector` or split into multiple fine-grained contexts (e.g. one for highlight state, one for registration functions, one for keyboard actions) so consumers only re-render when their specific slice changes.

**Files:** `BoardView.tsx`, `BoardKeyboardNavContext.tsx`, `ShortcutScopeContext.tsx`, `BoardStatsContext.tsx`.

**Effort:** Medium.

### 12. Reduce DnD collision detection scope (original #5) — DnD-specific win

**Remaining bottleneck:** Not re-profiled for DnD in the new session, but the original data showed 4.2s pointerdown block and 380ms `UpdateLayoutTree` touching 15,253 elements. Virtualization reduces the element count, but dnd-kit still evaluates collision against all registered sortables/droppables.

**Problem:** dnd-kit's default collision detection reads positions of all registered nodes on every `pointermove`. With 50 droppable containers + ~80–100 visible sortable rows, that's still 130+ position reads per move event.

**Fix:**

- Custom collision strategy that only checks the 1–2 lists geometrically nearest the pointer (spatial partitioning by list column X-coordinate).
- Disable intersection observers during active drag (they add overhead and are redundant with manual collision detection).
- Only register sortables within the currently-dragged-over list + its immediate neighbors.

**Files:** `useBoardTaskDndReact.ts`, `useLanesBoardDnd.ts`, `useStackedBoardDnd.ts`, new `collisionStrategy.ts`.

**Effort:** Medium.

### 13. Code-split the board route — reduce EvaluateScript cost

**Remaining bottleneck:** `EvaluateScript` at 195.9ms in the Chrome trace. The board route likely bundles all board-related code (DnD, keyboard nav, emoji picker, stats, task editor, Radix UI components) into one chunk that must be parsed and compiled before any rendering starts.

**Problem:** Even if the user is just viewing the board, the browser must parse and compile the JS for features that may not be immediately needed (task editor dialog, emoji picker, release editor, shortcut help, board search, etc.).

**Fix:**

- `React.lazy()` + `Suspense` for the task editor dialog, emoji picker, release/group editors, shortcut help dialog, and board search dialog. These are modal/dialog components that are only needed on user interaction.
- Dynamic `import()` for dnd-kit when the board has > 0 tasks (boards with no tasks don't need DnD at all).
- Consider splitting the board stats feature behind a lazy boundary since `showStats` is a per-board preference.

**Expected impact:** Reduce initial JS parse from ~196ms to ~80–100ms by deferring ~50% of the board route's code.

**Files:** `BoardView.tsx` (lazy imports for dialogs), build config (chunk splitting hints).

**Effort:** Low-medium.

### 14. Structural sharing for board query data — prevent unnecessary re-renders on SSE updates

**Remaining bottleneck:** `useBoardChangeStream` applies granular SSE updates to the React Query cache via `setQueryData`, but each update produces a new `board` object reference. Even with `boardColumnSpreadProps` spreading stable sub-references, `board.tasks` (a new array after any task update) invalidates the spread props and defeats `React.memo` on columns that didn't change.

**Problem:** When a single task is updated via SSE (e.g. another user moves a task), `setBoardCaches` creates a new board object with a new `tasks` array. `boardColumnSpreadProps` returns `boardTasks: board.tasks` — a new reference. Every memoized column receives new `boardTasks` and re-renders, even if the specific list's tasks didn't change.

**Fix:**

- **Per-list task array stability:** In `useBoardChangeStream`, when only one task changed, only replace that task's entry in the array while keeping the same array reference for lists whose tasks didn't change. This requires the pre-indexed `Map<listId:status, Task[]>` to be cache-aware.
- **Alternatively, move board data to a normalized store (Zustand):** Store tasks as a `Map<taskId, Task>` and lists as a `Map<listId, List>`. SSE updates mutate individual entries. Components subscribe to their specific list's tasks via selectors. Only the affected list re-renders.
- **React Query `structuralSharing`:** Ensure the query's `structuralSharing` option is enabled (default) and that the server response preserves object identity where possible. This helps for full refetches but not for manual `setQueryData` calls.

**Files:** `useBoardChangeStream.ts`, `queries.ts`, `boardColumnData.ts`.

**Effort:** Medium (patched sharing) to High (normalized store).

---

## Phase 4: Radical / architectural ideas (long-term)

These are larger architectural changes that would fundamentally alter the rendering model. Each is a significant investment but could unlock order-of-magnitude improvements for very large boards (1000+ tasks, 50+ lists).

### R1. Replace dnd-kit with a lightweight custom DnD engine

**Rationale:** dnd-kit is the dominant source of mount-time overhead. Its `useSortable` hook registers sensors, intersection observers, and position trackers per item. For a board with ~100 visible items across 50 containers, dnd-kit's internal bookkeeping is the single largest contributor to effects (602ms in StackedSortableList×50 alone) and GC pressure (closure/array churn from hook re-runs).

**Approach:**

- Build a minimal pointer-event-based DnD system that:
  - Does zero per-item registration at mount time. Items are just DOM nodes with `data-task-id` / `data-list-id` attributes.
  - On drag start: reads positions of elements in the source container + nearest neighbor containers using `getBoundingClientRect()` (spatial locality).
  - On drag move: hit-tests only the 2–3 geometrically nearby containers, not all 50.
  - On drop: reads the final position and computes the insertion index.
- The board's logical ordering (`displayTaskMap`) stays the same — only the DOM interaction layer changes.
- Keyboard reordering uses explicit index math rather than sortable semantics.

**Expected impact:** Eliminate ~850ms of mount-time effect work, reduce GC pressure from hook closures by ~30–40%, make drag-start near-instant (no position snapshot of all items).

**Effort:** Very high. Would require reimplementing drop animations, auto-scroll during drag, and accessibility (keyboard reordering). Best done incrementally — start with stacked layout where container geometry is simpler.

### R2. Canvas/virtual-DOM hybrid for task cards

**Rationale:** Even with virtualization, each mounted task card is a full React component subtree with ~15–20 DOM nodes (card shell, title, body preview, priority badge, group badge, release pill, status circle, icons). With ~100 visible rows, that's 1,500–2,000 DOM nodes just for task cards. A canvas-based renderer could reduce this to a single `<canvas>` element per viewport.

**Approach:**

- Render task cards as painted rectangles on a `<canvas>` overlay. Text rendering uses `canvas.measureText` + `fillText`. Priority/status colors are drawn as shapes.
- Hit-testing on `pointermove` / `click` identifies which task was interacted with and triggers the appropriate action (open editor, start drag, etc.).
- The interactive task editor dialog remains DOM-based — only the card "chrome" is canvas-rendered.
- Scroll is handled by translating the canvas viewport, not by mounting/unmounting components.

**Expected impact:** DOM nodes for task cards drop from ~2,000 to ~6–8 canvas elements. GC drops dramatically (no React fiber tree for cards). Initial render is a single canvas paint pass.

**Effort:** Very high. Text measurement, accessibility (ARIA for screen readers), and visual fidelity (hover states, focus rings, animations) are significantly harder on canvas. Best suited as an opt-in "performance mode" for boards exceeding a threshold (e.g. 500+ tasks).

### R3. Web Worker task computation pipeline

**Rationale:** Filtering, sorting, indexing, and container-map building currently run on the main thread inside `useMemo` / render callbacks. For 1000-task boards, these O(N) computations block the render thread for ~10–50ms per operation.

**Approach:**

- Move `buildTasksByListStatusIndex`, `listTasksMergedSortedFromIndex`, `buildStackedTaskContainerMap`, and filter matching to a dedicated Web Worker.
- The worker receives the raw task array + filter state, computes the indexed/sorted/filtered results, and posts them back via `postMessage`.
- The main thread receives pre-computed results and renders directly — no synchronous computation during the React render cycle.
- Use `SharedArrayBuffer` or `Transferable` objects to minimize serialization overhead.

**Expected impact:** Main-thread JS time during render drops by the computation cost (~20–50ms per render cycle). More importantly, the computation runs in parallel with the browser's layout/paint work.

**Effort:** High. Requires a message protocol, serialization strategy, and careful synchronization with React's render cycle (stale results during the transfer window).

### R4. Streaming / incremental board fetch

**Rationale:** The current fetch is a single `GET /api/boards/:id?slim=1` that returns the full board JSON. For a 1000-task board, even with truncated bodies, this is a ~200–500KB response that must be fully downloaded and parsed before React can start rendering.

**Approach:**

- **Server-Sent Events (SSE) initial load:** Send the board skeleton (lists, groups, priorities, releases, settings) first, then stream task chunks (e.g. 50 tasks per event) so the client can start rendering the first lists while the rest is still arriving.
- **Alternatively, paginated task loading:** `GET /api/boards/:id?slim=1&taskLimit=100` returns the first 100 tasks. The client renders immediately, then fetches remaining tasks in background batches and merges them into the React Query cache.
- **JSON streaming parser:** Use a streaming JSON parser (e.g. `oboe.js` or the native `ReadableStream` API with incremental JSON parsing) to begin processing the response before it's fully downloaded.

**Expected impact:** Time-to-first-paint drops from "full download + full parse + full render" to "skeleton download + first-chunk parse + first-column render." For a 1000-task board on a slow connection, this could reduce perceived load time from 7s to under 2s.

**Effort:** High. Server-side streaming requires restructuring the board endpoint. Client-side incremental rendering requires careful React Query cache management for partial data.

### R5. CSS `content-visibility: auto` for board columns

**Rationale:** A lightweight, zero-JS optimization. `content-visibility: auto` tells the browser to skip layout, paint, and hit-testing for elements that are off-screen. This is complementary to the IntersectionObserver-based column gating (Fix #4 addendum) but works at the browser engine level.

**Approach:**

- Apply `content-visibility: auto` and `contain-intrinsic-size: 288px 600px` (approximate column dimensions) to each `BoardListStackedColumn` shell div.
- The browser automatically skips rendering off-screen columns without any JS-level mount/unmount logic.
- This stacks with the existing IO-based gating: the IO unmounts the React subtree, and `content-visibility` ensures even the shell div's own layout is skipped when off-screen.

**Expected impact:** Reduced layout/paint cost for boards with many columns. The 161.5ms `UpdateLayoutTree` max could drop further as the browser skips style recalculation for off-screen column shells.

**Effort:** Low. Pure CSS change. Needs testing for scroll-anchoring side effects and potential layout jumps.

### R6. Normalized board store (Zustand) replacing React Query for board data

**Rationale:** React Query's cache model stores the entire board as a single object. Any update (task move, SSE event, optimistic mutation) replaces the board reference, defeating memoization. A normalized store would store entities individually, allowing surgical updates.

**Approach:**

- Store board data in Zustand with normalized shape: `tasks: Map<id, Task>`, `lists: Map<id, List>`, `releases`, `taskGroups`, etc.
- Components subscribe to their specific slice via Zustand selectors: `useStore(s => s.tasks.get(taskId))` or `useStore(s => s.tasksByList.get(listId))`.
- React Query fetches the board, then populates the Zustand store. SSE updates patch individual entities in the store.
- Only components whose specific entity changed re-render.

**Expected impact:** Eliminates the "new board reference = full re-render" problem entirely. SSE updates that change one task only re-render that task's card. Filter/sort changes only re-render the affected list columns. Potential 10–50× reduction in re-render scope for granular updates.

**Effort:** Very high. Requires migrating all board data consumers from React Query's `useBoard` to Zustand selectors. Touch points: every component that reads `board.tasks`, `board.lists`, `board.taskGroups`, etc. Best done incrementally — start with `tasks` normalization and keep list/group/release data in the existing flow.

---

## Phase 3 execution order

| Step | Item | Effort | Prerequisite |
|------|------|--------|-------------|
| 1 | Progressive column mounting (#9) | Medium | None |
| 2 | Deferred DnD sortable registration (#10) | Medium-high | None |
| 3 | Flatten provider cascade (#11) | Medium | None |
| 4 | Reduce DnD collision scope (#12, original #5) | Medium | Profiling DnD scenario |
| 5 | Code-split board route (#13) | Low-medium | None |
| 6 | Structural sharing for SSE updates (#14) | Medium-high | None |

Steps 1, 3, and 5 are independent and can be done in parallel. Step 2 pairs well with step 4 (both reduce DnD overhead). Step 6 is independent but benefits from being done alongside or after step 1 (progressive mounting reduces the impact of full re-renders during the mount window).

For radical ideas: R5 (`content-visibility: auto`) is the lowest-effort experiment — try it first. R1 (custom DnD) and R6 (normalized store) are the highest-impact long-term investments.

---

## Success criteria (updated with post-Phase-2 measurements)

| Metric | Original baseline | After Phase 2 | Phase 3 target |
|--------|-------------------|---------------|----------------|
| Board load (longest RunTask) | 14,703 ms | 7,445 ms | < 2,000 ms |
| Load GC wall time | 9,344 ms | 3,828 ms | < 500 ms |
| React total commit duration (load) | 4,123–4,753 ms | 1,596 ms | < 500 ms |
| Slowest single commit (load) | 967 ms | 582 ms | < 200 ms |
| Layout/effect duration (load) | 6,898–11,030 ms | 1,250 ms | < 200 ms |
| UpdateLayoutTree max (load) | 235.6 ms | 161.5 ms | < 50 ms |
| EvaluateScript | — | 195.9 ms | < 100 ms (after code split) |
| Hover per-commit duration | 536–637 ms | — (ref-backed, ~0) | < 16 ms ✅ |
| Hover commits per 10 cards | 20 | — (~0) | 0 ✅ |
| Drag pointerdown block | 4,223 ms | — (not re-profiled) | < 200 ms |
| Drag pointermove block | 1,297 ms | — (not re-profiled) | < 50 ms |
| DnD UpdateLayoutTree max | 380.9 ms | — (not re-profiled) | < 16 ms |
| Filter toggle total commit time | 13,895 ms | — (not re-profiled) | < 200 ms |
| DOM node count (1000-task board) | ~17,000+ | ~4,000–5,000 (est.) | < 2,000 (after progressive mount + canvas) |
| Time to first visible column | 14,703 ms (= full load) | 7,445 ms (= full load) | < 1,500 ms (progressive mount) |
