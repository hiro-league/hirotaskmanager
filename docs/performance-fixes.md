# Board performance — implemented fixes

This document records performance-related code changes for supervisor review. Each entry ties back to `docs/board-performance-plan.md` (Phase 2 and Phase 3 where noted) and the analysis in `docs/profiling-analysis.md`.

---

## Fix #1 — Ref-backed pointer hover in `BoardKeyboardNavProvider`

**Plan reference:** Phase 2, item 1 (“Ref-ify BoardKeyboardNavProvider state — critical quick win”).

### Problem (before)

- `hoveredTaskId` and `hoveredListId` were stored with `useState` inside `BoardKeyboardNavProvider`.
- `SortableTaskRow`, `TaskCard`, and list columns call `setHoveredTaskId` / `setHoveredListId` on pointer enter/leave.
- Those updates re-rendered the provider and rebuilt the React context `value` (they were in the `useMemo` dependency list).
- Every consumer of `useBoardKeyboardNavOptional()` re-rendered on each hover boundary — effectively the full board on mouse move across cards.
- Profiling (1000-task board): 20 hover commits ≈536–637 ms each; layout/effect time exceeded commit time, consistent with mass re-renders and effect churn.

### Solution (after)

- Store hover targets in **`useRef`** (`hoveredTaskIdRef`, `hoveredListIdRef`).
- Expose **stable** `setHoveredTaskId` / `setHoveredListId` callbacks (`useCallback` with empty deps) that only assign the refs — **no React state updates** for hover.
- `focusOrScrollHighlight` (keyboard / F flow) reads **`ref.current`** when applying hover to highlight, so behavior stays the same for “focus under pointer.”
- Board switch (`board.id`), `columnMap` changes, and `listColumnOrder` changes still **sanitize** hover by clearing or correcting ref values where the old logic used functional `setState` — without scheduling renders.
- Removed **`hoveredTaskId` / `hoveredListId`** from the public context value type and object: nothing in the codebase read those fields; only the setters were used. JSDoc on the interface documents ref-backed hover.

### Files changed

| File | Change |
|------|--------|
| `src/client/components/board/shortcuts/BoardKeyboardNavContext.tsx` | Refs + stable setters; sync effects; `focusOrScrollHighlight`; context shape; inline comment explaining the perf rationale |

### Expected impact

- **Large reduction** in React commits and subtree re-renders when moving the mouse across many task cards.
- **Unchanged** user-facing behavior for F / Tab flows that use “hovered” task or list as a transient target (reads refs at action time).
- **Does not** by itself fix initial load, filter-toggle cascades, or DnD collision/layout cost (other plan items).

### Suggested verification (for reviewer or QA)

1. **Manual:** 1000-task board — sweep mouse across many cards; UI should stay responsive (no multi-second stalls).
2. **React Profiler:** Record “hover 10+ cards”; expect **near-zero commits** attributable to hover vs. many ~600 ms commits before.
3. **Regression:** Keyboard focus from pointer target still works where product expects it (e.g. flows that call `focusOrScrollHighlight` after hover).

### Related documentation

- `docs/board-performance-plan.md` — Phase 2 item 1, execution order step 2.
- `docs/profiling-analysis.md` — §1.2 (hover), §2.1 (`BoardKeyboardNavProvider` as updater).

---

## Fix #3 — Pre-index tasks by `(listId, status)`

**Plan reference:** Phase 2, item 3 (“Pre-index tasks by (listId, status) — enabler for #2”).

### Problem (before)

- `listStatusTasksSorted` and stacked `listTasksMergedSorted` scanned the full `board.tasks` array for every list×status band (and merged paths).
- With *N* tasks and *B* bands, that was **O(N × B)** work per render cycle in the hot path, on top of the much larger render cost documented in the plan.

### Solution (after)

- **`buildTasksByListStatusIndex(tasks)`** — one **O(N)** pass: group tasks into a `Map` keyed by `` `${listId}:${status}` ``, then sort each bucket by `order`.
- **`listStatusTasksSortedFromIndex`**, **`listTasksMergedSortedFromIndex`**, **`listColumnTasksSortedFromIndex`** — each band or merged list does **O(size of bucket)** filter work only (shared `taskMatchesBoardFilter` predicate unchanged).
- **Single index per `board.tasks` reference:**
  - **`useLanesBoardDnd` / `useStackedBoardDnd`** — `useMemo` on `[board.tasks]`, reuse for container-map building; exposed as **`tasksByListStatus`** for column children.
  - **`BoardKeyboardNavProvider`** — separate `useMemo` on `[board.tasks]` for `buildListColumnTaskIds` (provider wraps columns; avoids threading through `BoardView` for now). This duplicates one O(N) index build per board render vs. the DnD hook (acceptable vs. former O(N×B) band scans).
- **Legacy helpers** (`listStatusTasksSorted`, `listTasksMergedSorted`, `listColumnTasksSorted`) still exist and delegate to *build index + FromIndex* for any remaining callers.

### Files changed

| File | Change |
|------|--------|
| `src/client/components/board/boardStatusUtils.ts` | Index builder, `*FromIndex` helpers; removed unused `statusOrderIndex` after merged-sort path change |
| `src/client/components/board/useLanesBoardDnd.ts` | Build/pass index into lane container map; return `tasksByListStatus` |
| `src/client/components/board/useStackedBoardDnd.ts` | Same for stacked container map |
| `src/client/components/board/BoardColumns.tsx` | Pass `tasksByListStatus` into columns + drag overlay |
| `src/client/components/board/BoardColumnsStacked.tsx` | Same |
| `src/client/components/board/BoardDragOverlayContent.tsx` | Require `tasksByListStatus` for overlay columns |
| `src/client/components/board/BoardListColumn.tsx` | Plumb `tasksByListStatus` → `ListStatusBand` |
| `src/client/components/board/ListStatusBand.tsx` | Derive `tasks` via `listStatusTasksSortedFromIndex` |
| `src/client/components/board/BoardListStackedColumn.tsx` | Plumb index into `ListStackedBody`; static task list via `listTasksMergedSortedFromIndex` |
| `src/client/components/board/shortcuts/boardTaskNavigation.ts` | `buildListColumnTaskIds` takes pre-built index (no `board` param) |
| `src/client/components/board/shortcuts/BoardKeyboardNavContext.tsx` | Memoized index + updated `buildListColumnTaskIds` call |

### Expected impact

- **Lower CPU** on each render from band/list task resolution: **O(N) + Σ band work** instead of **O(N × B)** full scans.
- **Does not** by itself stop React from re-rendering all tasks when `board` identity changes (that is plan **#2**). The index **stabilizes on `board.tasks` reference**, which prepares memoization and slice-based props in #2.

### Suggested verification

1. **Manual:** Lanes + stacked boards with filters — task order and keyboard navigation order match pre-change behavior.
2. **DnD:** Drag tasks within/between bands and stacked lists; container maps should match visible cards.

---

## Fix #6 — Lazy-mount list header emoji dropdown (Radix Portal / Popper)

**Plan reference:** Phase 2, item 6 (“Lazy-mount Popper/Presence on list headers — load quick win”).

### Problem (before)

- Each **`ListHeader`** embeds **`EmojiPickerMenuButton`**, which always mounted a full **`@radix-ui/react-dropdown-menu`** subtree (`Root` → **`Portal`** → **`Content`**) for every list on the board.
- Profiling called out **`Popper` / `Presence`** multiplying by list count (~50) on initial load, with **`ListStackedBody`** in the same heavy commit. The ⋮ **actions menu** in `ListHeader` was already plain DOM and only rendered when open; the emoji control was the eager Radix stack.

### Solution (after)

- **`EmojiPickerMenuButton`** accepts **`lazyMountDropdown`** (default **`false`** for existing callers).
- When **`true`**: **`Portal` + `Content`** (and the emoji picker UI inside) render only after the user **`pointerdown`** or **`Enter` / `Space`** on the trigger. **`flushSync`** runs that mount **before** the same gesture’s **click** opens the menu so Radix still opens correctly on first use.
- **`ListHeader`** passes **`lazyMountDropdown`** on every **`ListEmojiPicker`** instance so board load no longer pays for dozens of unused dropdown portals.

### Files changed

| File | Change |
|------|--------|
| `src/client/components/emoji/EmojiPickerMenuButton.tsx` | `lazyMountDropdown` + conditional `Portal`/`Content`; sync mount on trigger interaction |
| `src/client/components/list/ListHeader.tsx` | Enable `lazyMountDropdown` for header emoji pickers; short perf comment |

### Expected impact

- **Faster initial board load** and less main-thread work when many lists are visible, with **no change** to emoji UX after the first open per header (portal stays mounted).
- Other **`EmojiPickerMenuButton`** usages (board chrome, task editor, etc.) keep default **eager** mount unless they opt in.

### Suggested verification

1. **Manual:** Board with many lists — load; confirm no errors and lower React work vs. before (Profiler optional).
2. **Emoji:** Open emoji from a list header (mouse and keyboard), pick/clear emoji; menu should open on first try.
3. **Regression:** Non-list emoji buttons (e.g. board title, add-list row) unchanged unless given `lazyMountDropdown`.

---

## Fix #2 — Granular board props / `React.memo` on bands and columns

**Plan reference:** Phase 2, item 2 (“Stop passing full `board` as prop / enable memoization”).

### Problem (before)

- React Query often supplies a **new `board` object** on each cache touch even when **`board.tasks`**, **`taskGroups`**, and other fields are referentially unchanged.
- **`BoardListColumn`**, **`BoardListStackedColumn`**, and **`ListStatusBand`** each took **`board`**. **`React.memo`** on columns could not skip re-renders when only the wrapper identity changed.

### Solution (after)

- **`boardColumnSpreadProps(board)`** in `boardColumnData.ts` returns a stable **set of primitives and references** used by list UI: `boardId`, `showStats`, `taskGroups`, `taskPriorities`, `releases`, `defaultTaskGroupId`, `boardTasks`, `boardVisibleStatuses`.
- **`BoardColumns` / `BoardColumnsStacked`** resolve **`list`** once per column and pass **`{...boardColumnSpreadProps(board)}`** plus **`list`** — no `board` prop on column/band components.
- **`ListStatusBand`** is wrapped in **`React.memo`** and consumes **`BoardBandSpreadProps`** (band fields without `showStats` / stored visible-status prefs where unused).
- **`TaskEditor`** accepts **`TaskEditorBoardData`** (`Pick<Board, …>`) instead of full **`Board`**; columns pass a small inline object when the editor renders.
- **Stacked visible statuses:** **`visibleStatusesFromStored`** in `shared/boardFilters.ts` (re-exported from `boardStatusUtils`) replaces **`visibleStatusesForBoard(board)`** where only **`board.visibleStatuses`** + workflow order are needed — stacked overlay receives **`visibleStatuses`** from the parent hook to avoid extra **`board`** reads in the overlay.
- **Refs for mutations** in bands/stacked bodies use **`surfaceRef`** (`boardId` + `boardTasks`) instead of **`boardRef`**.

**Deferred (not needed yet):** Context/Zustand selectors (see original plan alternative).

### Files changed (high level)

| Area | Files |
|------|--------|
| Slice types + factory | `boardColumnData.ts` |
| Status prefs helper | `shared/boardFilters.ts`, `boardStatusUtils.ts` |
| Lanes | `BoardColumns.tsx`, `BoardListColumn.tsx`, `ListStatusBand.tsx`, `BoardDragOverlayContent.tsx` |
| Stacked | `BoardColumnsStacked.tsx`, `BoardListStackedColumn.tsx`, `BoardDragOverlayContent.tsx` |
| Editor typing | `TaskEditor.tsx` |

### Expected impact

- When **`board.tasks`** (and other spread fields) keep the **same references**, **memoized** columns/bands can **skip re-renders** that were previously forced by a new **`board`** wrapper — e.g. metadata-only updates or structural sharing from the query client.
- **Does not** help when **`board.tasks`** is a new array on every update (common on full board refetch); **virtualization (#4)** and further slicing remain the next levers.

### Suggested verification

1. **React Profiler:** Toggle a filter or patch a task; confirm fewer **`ListStatusBand`** / **`SortableTaskRow`** updates when unrelated lists are unchanged (best case with stable task array refs).
2. **Regression:** Lanes + stacked, **`TaskEditor`**, list drag overlay, emoji/stats headers.

---

## Fix #7 — Slim `GET /api/boards/:id` (truncated task bodies)

**Plan reference:** Phase 2, item 7 (“Trim task body from board payload — server-side win”).

### Problem (before)

- **`GET /api/boards/:id`** returned every task’s full **`body`** string. The board UI only needs a short preview on cards (up to **140** characters after whitespace normalization in **`TaskCard`**).
- Large boards pay for **network**, **JSON parse**, and **heap** proportional to total description bytes even though most of that text is never shown on the board.

### Solution (after)

- **Query parameters on `GET /api/boards/:id` only** (mutations and **`hirotm`** unchanged — default is still full bodies):
  - **`?slim=1`** or **`?slim=true`** — cap each task body in **SQLite** with **`SUBSTR(t.body, 1, n)`** using **`BOARD_FETCH_SLIM_TASK_BODY_CHARS`** (**256** in `src/shared/boardPayload.ts`), so long bodies are not fully read from the DB into the server process.
  - **`?bodyPreview=<n>`** — explicit cap, clamped to **`0…BOARD_FETCH_MAX_TASK_BODY_PREVIEW_CHARS`** (**8192**). Invalid values are ignored (full bodies).
- **`loadBoard(boardId, options?)`** accepts optional **`{ taskBodyMaxChars }`**; all other **`loadBoard`** call sites keep the previous behavior.
- **Web app `fetchBoard`** appends **`?slim=1`** so **`useBoard`** / initial board loads use the slim path.
- **`TaskEditor`** (edit mode) loads **`GET /api/boards/:boardId/tasks/:taskId`** via **`useQuery`** (**`boardTaskDetailKey`**) so the description field always reflects the **full** body after load; while that query is pending, the dialog is **busy** and the form is not seeded with a possibly truncated **`body`**. **`useUpdateTask`** / **`useDeleteTask`** and **`useBoardChangeStream`** keep the task-detail cache aligned with the entity from the server.

### Files changed

| File | Change |
|------|--------|
| `src/shared/boardPayload.ts` | Shared caps for slim default and max **`bodyPreview`** |
| `src/server/storage/board.ts` | **`LoadBoardOptions`**, **`SUBSTR`** branch in task SELECT |
| `src/server/routes/boards.ts` | **`parseBoardFetchBodyPreview`**, **`GET /:id`** passes options into **`loadBoard`** |
| `src/server/storage/boardLoadSlim.test.ts` | **`loadBoard`** slim behavior |
| `src/client/api/queries.ts` | **`fetchBoard`** `?slim=1`**, **`boardTaskDetailKey`** |
| `src/client/components/task/TaskEditor.tsx` | Full-task query for edit mode; pending gate + busy |
| `src/client/api/mutations/tasks.ts` | **`setQueryData` / `removeQueries`** for task detail on update/delete |
| `src/client/api/useBoardChangeStream.ts` | **`setQueryData`** task detail after external task fetch |

### Expected impact

- **Smaller** board JSON, **less** parse/GC work on the client for large task descriptions.
- **Less** SQLite → server memory traffic for bodies beyond the preview cap.
- **Unchanged** CLI and any client that omits **`slim`** / **`bodyPreview`**.
- **Mutation responses** that still return a full **`Board`** can temporarily reintroduce full bodies into the React Query cache until the next slim refetch or targeted cache writes.

### Suggested verification

1. **Network:** Open a board with long task descriptions — **`GET /api/boards/<id>?slim=1`** response bodies should be truncated per task.
2. **Task editor:** Open a task with a long description — full text appears after load; save still works.
3. **`hirotm boards show`:** Still receives full task bodies (no slim query).

---

## Fix #8 — Cheaper DnD container-map dependencies

**Plan reference:** Phase 2, item 8 (“Cheaper container map signature — minor win”).

### Problem (before)

- **`tasksLayoutSig`** in **`useLanesBoardDnd`** / **`useStackedBoardDnd`** built a **large string** by mapping every task’s layout fields and **`join("|")`**, only to embed that string in **`containerMapDeps`** for memo invalidation.
- **`serializeTaskContainerMap`** in **`useBoardTaskDndReact`** built another **large string** (sorted keys + joined IDs) on **every** comparison when reconciling **`pendingTaskMap`** with the server map and when detecting **no-op** drag ends.

### Solution (after)

- **`hashTasksForDndLayoutDeps(tasks)`** — single **FNV-1a** pass over the same fields as the old per-task string, in **`tasks` array order**, plus length (avoids megabyte-scale **`join`** for large boards).
- **`taskContainerMapsEqual(a, b)`** — compare container maps by **sorted keys** and **per-array element equality** without allocating signature strings.
- **`serializeTaskContainerMap`** removed (no remaining callers).

### Files changed

| File | Change |
|------|--------|
| `src/client/components/board/boardTaskDndDeps.ts` | Hash + structural equality helpers |
| `src/client/components/board/boardTaskDndDeps.test.ts` | Unit tests |
| `src/client/components/board/useLanesBoardDnd.ts` | **`tasksLayoutHash`** in **`containerMapDeps`** |
| `src/client/components/board/useStackedBoardDnd.ts` | Same |
| `src/client/components/board/useBoardTaskDndReact.ts` | **`taskContainerMapsEqual`** instead of serialize/compare |

### Expected impact

- **Less** CPU and short-lived string garbage on boards with many tasks when DnD hooks reconcile maps.
- **Theoretical** 32-bit hash collision could skip a memo refresh; probability is negligible for this use.

### Suggested verification

1. **Manual:** Drag tasks within and across bands (lanes + stacked); drops and no-op drags behave as before.
2. **Unit:** **`bun test src/client/components/board/boardTaskDndDeps.test.ts`**.

---

## Fix #4 — Virtualize task lists

**Plan reference:** Phase 2, item 4 (“Virtualize task lists — highest impact on load, highest complexity”).

### Problem (before)

- Every visible board task mounted a real React subtree plus **`useSortable`** registration.
- Large boards paid that cost up front on initial render, on scroll, and during drag because dnd-kit had to track every mounted row.
- Keyboard navigation assumed the highlighted task already had a mounted DOM element, which stops being true once offscreen rows are virtualized.

### Solution (after)

- Added **`@tanstack/react-virtual`** and a shared **`useVirtualizedBand`** hook for task-row windowing.
- **Lanes:** each **`ListStatusBand`** now owns its scroll viewport and virtualizes sortable task rows per status band.
- **Stacked:** each **`BoardListStackedColumn`** virtualizes its sortable task rows per list.
- **DnD safety:** the board still keeps the full logical **`displayTaskMap`** / **`sortableIds`** for every filtered task; virtual rows pass their **full logical index** into **`useSortable`** so drag ordering remains correct even though only a subset of rows is mounted.
- **Keyboard-nav safety:** **`BoardKeyboardNavContext`** now supports **task revealers**. Virtualized bands/lists register a callback that scrolls an offscreen highlighted task into view before the nav layer expects **`registerTaskElement()`** to exist.
- **Scoped fallback:** stacked quick-add insertion and drag-overlay rendering still use the non-virtualized path so the composer placement and overlay chrome keep their previous behavior while the main board gets the performance win.

### Files changed

| File | Change |
|------|--------|
| `src/client/components/board/useVirtualizedBand.ts` | Shared TanStack virtualizer wrapper + task reveal helper |
| `src/client/components/board/ListStatusBand.tsx` | Virtualized lane-band sortable rows; band-owned scroll containers |
| `src/client/components/board/BoardListColumn.tsx` | Lane shells delegate scrolling to `ListStatusBand` so each band can own its viewport |
| `src/client/components/board/BoardListStackedColumn.tsx` | Virtualized stacked sortable rows with quick-add fallback |
| `src/client/components/board/shortcuts/BoardKeyboardNavContext.tsx` | Offscreen task reveal bridge for keyboard navigation |
| `package.json`, `bun.lock` | Added `@tanstack/react-virtual` |

### Expected impact

- **Large reduction** in mounted task rows, DOM nodes, and sortable registrations on long boards.
- **Lower** initial render cost and less drag/scroll work because only the viewport slice mounts.
- **Preserved** logical DnD ordering and keyboard traversal across offscreen tasks.

### Suggested verification

1. **Manual:** Open a large stacked board and a large lanes board; scroll deep into a list/band and confirm rows mount smoothly without blank gaps.
2. **DnD:** Drag within the same viewport, then across lists/statuses after scrolling so source/target rows were initially offscreen.
3. **Keyboard:** Use arrows, `Home`, `End`, `PageUp`, `PageDown`, and focus-from-hover flows on offscreen tasks; the board should scroll the target into view and keep the selection ring aligned.
4. **Stacked quick-add:** Open the add-task composer in stacked layout and confirm it still appears after the open-status block.

---

## Fix #4 addendum — Horizontal column gating (IntersectionObserver)

### Problem

Vertical virtualization (TanStack Virtual) inside each band/column cuts mounted task
rows within a single list, but **all 50 columns** still mount their full body trees —
sortable registrations, virtualizers, keyboard-nav hooks, scroll containers — even when
only 6 columns are visible in the horizontal viewport at any time.

With 50 lists × ~13 visible+overscan rows each ≈ **650 mounted task cards** and
**650 `useSortable` instances**, the board remained sluggish during horizontal scroll,
filtering, and navigation.

### Solution — `useColumnInViewport`

A lightweight `IntersectionObserver` hook (`useColumnInViewport.ts`) watches each
column's outermost shell div. When a column scrolls outside the visible area (plus a
320 px margin on each side — roughly one column width of pre-mounting buffer), the
heavy `ListStackedBody` / `ListColumnBody` is unmounted and replaced with just a
`ListHeader` placeholder. This preserves:

- **Correct layout width** — the column shell div (`w-72`) stays mounted so horizontal
  scroll size and column-reorder DnD remain correct.
- **Column DnD** — `useBoardColumnSortableReact` remains active on the shell; only the
  inner task body is gated.
- **Seamless scroll** — the 320 px root margin ensures the body mounts before the user
  can see a blank column at normal scroll speeds.
- **Keyboard list navigation** — the list element is still registered with
  `BoardKeyboardNavContext` via `listColumnShellRef`, so arrow-key list traversal
  continues to work; when the highlight lands on an off-screen list the shell scrolls
  into view, the IO fires, and the body mounts.

### Expected numbers (50 lists, 6 visible)

| Metric | Before gating | After gating |
|--------|---------------|--------------|
| `[data-list-column]` | 50 | 50 (shells stay) |
| `[data-task-card-root]` | ~614 | ~80–100 |
| `useSortable` task instances | ~614 | ~80–100 |
| Total DOM nodes | ~10 900 | ~4 000–5 000 |

### Files changed

| File | Change |
|------|--------|
| `src/client/components/board/useColumnInViewport.ts` | New IO-based hook |
| `src/client/components/board/BoardListStackedColumn.tsx` | Gate `ListStackedBody` with `inViewport`; show `ListHeader` placeholder when off-screen |
| `src/client/components/board/BoardListColumn.tsx` | Gate `ListColumnBody` with `inViewport`; show `ListHeader` placeholder when off-screen |

### Suggested verification

```js
// In browser console on the board with 50 lists:
document.querySelectorAll('[data-list-column]').length      // 50 (all shells)
document.querySelectorAll('[data-task-card-root]').length    // ~80-100 (visible cols only)
document.querySelectorAll('.touch-none').length              // ~80-100
```

Scroll horizontally and watch the task-card count stay roughly constant as off-screen
columns unmount their bodies and newly-visible columns mount theirs.

## Fix #4 addendum — Ref-backed keyboard highlight updates

### Problem

After virtualization and horizontal column gating, keyboard navigation between lists was
still slower than expected. The remaining cost came from `BoardKeyboardNavContext`:
`highlightedTaskId` and `highlightedListId` still lived in React state, so every
arrow-key move rebuilt the context value and re-rendered every consumer.

That meant the keyboard ring on the newly selected list/task was cheap by itself, but
the *way* it was delivered was expensive:

- all mounted `TaskCard` components re-checked `nav?.highlightedTaskId === task.id`
- all mounted list columns re-checked `nav?.highlightedListId === list.id`
- then `scrollIntoView()` / scroll nudges ran on top of that render cascade

### Solution

Keep the logical highlight ids in refs inside `BoardKeyboardNavContext`, and update the
selection ring imperatively on the registered DOM nodes instead of driving it through
React renders.

- `highlightedTaskId` / `highlightedListId` are now getter-backed ref values in the
  context API, so `BoardView` keyboard actions still read the current selection.
- `registerTaskElement()` and `registerListElement()` apply the ring immediately if the
  mounted element matches the current highlighted id.
- `setHighlightedTaskId()` / `setHighlightedListId()` now:
  - remove the ring from the previously highlighted DOM node
  - apply it to the newly highlighted DOM node
  - keep the same reveal / scroll-into-view behavior for virtualized tasks and
    horizontally gated columns
- `TaskCard`, `BoardListColumn`, and `BoardListStackedColumn` no longer subscribe to
  highlight state just to decide whether to render ring classes.

### Why this helps

This completes the intent of performance-plan item #1 for the keyboard-navigation path:
hover had already moved to refs, but keyboard highlight itself was still broad
state-driven. With this addendum, moving left/right between lists no longer asks the
board tree to re-render just to move one ring.

### Files changed

| File | Change |
|------|--------|
| `src/client/components/board/shortcuts/BoardKeyboardNavContext.tsx` | Move highlight ids to refs; apply/remove keyboard ring imperatively on registered elements |
| `src/client/components/task/TaskCard.tsx` | Stop deriving keyboard highlight classes from context render state |
| `src/client/components/board/BoardListColumn.tsx` | Stop deriving list ring classes from context render state |
| `src/client/components/board/BoardListStackedColumn.tsx` | Stop deriving list ring classes from context render state |

---

## Fix #9B + initial `inViewport` — Progressive stacked columns and first-paint body gate

**Plan reference:** Phase 3, item 9 (“Chunked / progressive column mounting — break the 7.4s RunTask”), **Option B**; extends the Fix #4 addendum horizontal gating so the **first** React commit does not mount every `ListStackedBody`.

### Problem (before)

- **`BoardColumnsStacked`** rendered all **`BoardListStackedColumn`** instances in one `flatMap` pass. Even with vertical virtualization inside each list, **50 column shells** (headers, scroll roots, DnD wiring, `useColumnInViewport` setup) still landed in a single synchronous render wave.
- **`useColumnInViewport`** defaulted **`inViewport` to `true`**, so **every** mounted column’s first commit still included **`ListStackedBody`** (virtualizers, droppables, task rows). The **`IntersectionObserver`** only ran after **`useEffect`**, so off-screen columns **paid full body mount once** before the observer could cull them.

### Solution (after)

**1. Progressive column mount (#9B) — `BoardColumnsStacked.tsx`**

- Mount only the first **`STACKED_COLUMNS_INITIAL_MOUNT` (8)** list columns as real **`BoardListStackedColumn`** components on the first slice.
- Remaining slots render **`w-72 shrink-0`** width placeholders (`data-stacked-column-placeholder`) so horizontal scroll width matches the full board.
- **`requestIdleCallback`** (with **`setTimeout(..., 1)`** fallback) grows **`mountedColumnCount`** in batches of **`STACKED_COLUMNS_IDLE_BATCH` (8)** until every list has a real column.
- **`board.id`** change resets the counter; shrinking **`localListIds.length`** clamps **`mountedColumnCount`** so it never exceeds the list count.

**2. Correct initial horizontal gate — `useColumnInViewport.ts`**

- **`inViewport` initial state is `false`** so the first commit does not assume every column is near the scrollport.
- **`useLayoutEffect`** measures the column element against **`BoardScrollRootContext`** (same **500px** margin as the observer) and sets **`inViewport`** to **`true` before paint** when already near the viewport, avoiding a visible “header-only” flash for on-screen columns.
- The existing **`IntersectionObserver`**, debounced hide, and **`getBoundingClientRect`** safety check are unchanged for scroll-driven updates.

### Trade-offs (reviewer / QA)

- **DnD / interaction:** Lists that are still **placeholders** have no task surface until their idle batch mounts — drops onto those lists are impossible until then.
- **Fast horizontal scroll:** The user may scroll into the placeholder region **before** the next batch runs; columns fill in as idle work completes (same class of issue called out in the plan for Option B).
- **Body unmount on horizontal scroll out:** **`ListStackedBody`** still **unmounts** when a **mounted** column leaves the gated region and **remounts** when it returns — that behavior predates this change; #9B only staggers **when** each column component first appears.

### Files changed

| File | Change |
|------|--------|
| `src/client/components/board/BoardColumnsStacked.tsx` | `mountedColumnCount`, idle batching, placeholders |
| `src/client/components/board/useColumnInViewport.ts` | Initial `false`, `useLayoutEffect` sync visibility, shared `columnNearHorizontalViewport` helper |

### Expected impact

- **Shorter initial critical path:** fewer column bodies and less hook work on the first frames; remaining columns hydrate during idle time.
- **No eager “mount all bodies” frame** from the old **`useState(true)`** default for columns that are actually off-screen once layout is known.

### Suggested verification

1. **Manual:** Board with many lists — first paint shows a subset of full columns; the rest appear shortly without horizontal width collapse.
2. **Scroll:** Pan horizontally; gated columns still swap between **`ListHeader`**-only and full body near the scrollport (Fix #4 addendum behavior preserved for mounted columns).
3. **Board switch:** Open another board and confirm progressive mount resets cleanly.
4. **DnD:** After the board is fully mounted, drag tasks as usual; avoid expecting drops onto not-yet-mounted placeholder columns during the first second of load.

### Related documentation

- `docs/board-performance-plan.md` — Phase 3, item 9 (Options A–C); Phase 2 / Fix #4 addendum for horizontal gating context.

---

*Add subsequent fixes as new sections above this note (e.g. `## Fix #10 — …`).*
