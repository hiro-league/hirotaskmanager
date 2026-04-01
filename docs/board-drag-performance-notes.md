# Board drag performance notes

This document explains the two drag performance optimizations identified for the stacked board layout, what has already been implemented, and how a future coding agent should decide whether to continue with the larger refactor.

## Problem summary

The stacked board can feel slow when dragging tasks on larger boards, even when the user only reorders inside one list.

Observed shape of the slow case:

- stacked layout
- about 10 lists
- about 100 tasks total
- about 20 tasks in the active list
- drag within one list, moving only a few positions

Profiling pointed to large React commits during drag, with board-wide work centered around the stacked board subtree and many sortable task rows.

Relevant code paths:

- `src/client/components/board/BoardColumnsStacked.tsx`
- `src/client/components/board/BoardListStackedColumn.tsx`
- `src/client/components/board/SortableTaskRow.tsx`
- `src/client/components/board/useTaskDndCore.ts`
- `src/client/components/board/useStackedBoardDnd.ts`

## Root causes

### 1. Broad prop fan-out from the task container map

During task drag, `useTaskDndCore()` updates the optimistic container map on every `onDragOver`. That map is a top-level `Record<string, string[]>` keyed by list container id.

Before the first optimization, `BoardColumnsStacked` passed the entire map to every stacked column:

- parent prop: `stackedTaskMap`
- child looked up its own `sortableIds` from that map

That meant even when only one or two lists changed during drag, all columns received a changed prop reference and became eligible to re-render.

This is especially wasteful in stacked view because cross-list drag usually changes only:

- the source list
- the target list

Unrelated lists should be able to keep stable props.

### 2. Global `DndContext` + many `useSortable()` subscribers

The stacked board still keeps all task rows under one `DndContext`, and each row uses `useSortable()`.

That means drag updates from dnd-kit can still propagate through many sortable rows, even after prop fan-out is reduced.

This second issue is real, but it is a larger architectural concern than the first one.

## Optimization 1: pass only per-list `sortableIds`

### Goal

Ensure each stacked column receives only the list-specific array it actually needs, so unrelated columns can stay memoized during drag.

### What changed

This optimization has already been implemented.

Current shape:

- `BoardColumnsStacked` now computes `taskContainerId` and `sortableIds` per list
- `BoardListStackedColumn` now receives `sortableIds: string[]`
- `ListStackedBody` now also receives `sortableIds: string[]`
- the old `stackedTaskMap` prop was removed from the stacked column path

Key files changed:

- `src/client/components/board/BoardColumnsStacked.tsx`
- `src/client/components/board/BoardListStackedColumn.tsx`

### Why this helps

When the optimistic drag state changes, only the source and target list arrays should get new references. Unaffected lists should keep the same `sortableIds` reference.

This gives `memo(BoardListStackedColumn)` a real chance to skip work for untouched lists.

### Scope

This was a small-to-medium refactor:

- prop reshaping only
- no change to drag persistence logic
- no change to data model or server API
- no intended behavior change for same-list or cross-list drag

### Expected impact

This is the highest-confidence optimization and should be attempted first on large stacked boards.

It is the best cost/benefit fix because it directly addresses unnecessary board-wide re-renders caused by the app's own prop flow.

## Optimization 2: reduce `useSortable()` / `DndContext` fan-out

### Goal

Reduce how much of the board participates in drag-state updates while a task is being dragged.

### What this means

This is not just a prop cleanup. It changes drag architecture.

Possible directions include:

- reducing how many rows are live `useSortable()` subscribers during task drag
- separating list-column drag concerns from task-row drag concerns
- making some lists or rows droppable-only until they are actually involved
- rethinking how optimistic drag state is reflected in React during high-frequency pointer movement

### Why this helps

Even after Optimization 1, every sortable row still lives under one shared dnd-kit context:

- `BoardColumnsStacked` owns the board-wide `DndContext`
- `BoardListStackedColumn` uses `useSortable()` for list columns
- `SortableTaskRow` uses `useSortable()` per task row

If drag is still slow after Optimization 1, the remaining cost is likely coming from this dnd-kit subscription fan-out.

### Scope

This is a medium-to-large refactor.

Likely touched files:

- `src/client/components/board/BoardColumnsStacked.tsx`
- `src/client/components/board/BoardListStackedColumn.tsx`
- `src/client/components/board/SortableTaskRow.tsx`
- `src/client/components/board/useTaskDndCore.ts`
- `src/client/components/board/useStackedBoardDnd.ts`
- possibly `src/client/components/board/dndIds.ts`
- possibly overlay code, collision handling, and keyboard navigation integration

### Risks

- breaking same-list task reorder
- breaking cross-list task moves
- breaking list-column drag while task drag still works, or vice versa
- introducing overlay or collision regressions
- making keyboard navigation / task registration assumptions stale

### Expected impact

Potentially medium-to-large, but lower confidence than Optimization 1 because it depends on what cost remains after prop fan-out is fixed.

Do not start with this optimization first unless profiling clearly shows the board is still dominated by dnd-kit row-level updates after Optimization 1.

## Additional failure mode: `Maximum update depth exceeded`

The notes above describe drag slowness, but there is also a distinct stability bug that can appear during long drag-hover sessions without dropping:

- pick up a task
- keep moving it back and forth across list boundaries
- do not drop
- eventually React throws `Maximum update depth exceeded`
- the terminal stack points into `node_modules/@dnd-kit/sortable/dist/sortable.esm.js` inside `useDerivedTransform()` (`setDerivedtransform(...)`)

This is not just "drag is slow." It is a nested update / layout feedback loop.

### Why this is different from normal render cost

Slow drag means React commits are large or frequent. This error means React hit its nested-update safety limit because the drag system kept producing state updates during commit.

The likely loop is:

1. `onDragOver` in `useTaskDndCore()` rewrites the optimistic container map.
2. The source container shrinks and the target container grows.
3. dnd-kit sees changed indices / geometry and runs `useDerivedTransform()`.
4. `useDerivedTransform()` sets internal React state for shifted sortable items.
5. Those state updates trigger another commit while pointer hover is still changing collision results.
6. Another cross-container `onDragOver` fires and the cycle repeats.

This is consistent with the observed stack and with the fact that the crash can be reproduced by prolonged hover oscillation even before drop persistence runs.

### Important scope update

This is not stacked-only.

The bug was first investigated from the stacked board path, but later reproduction showed the same terminal error can also happen in lanes layout after enough repeated cross-list hover movement. That means:

- stacked layout likely has extra sensitivity because list height changes are more obvious there
- but the underlying risk is broader than stacked-only render fan-out
- fixes that only target stacked layout should be treated as partial mitigation, not the full solution

### Relationship to the existing optimizations

Optimization 1 still matters because it reduces unnecessary re-renders.

Optimization 2 still matters because many `useSortable()` subscribers under one `DndContext` increase drag churn.

But neither section above fully explains the crash by itself. The crash appears to be the interaction of:

- optimistic cross-container moves during `onDragOver`
- geometry changes during drag
- dnd-kit's transform-derivation state updates
- repeated collision changes while the pointer keeps hovering between nearby containers

## Earlier hypothesis that turned out incomplete

An earlier reading of the bug treated drag-time geometry churn as the most likely root cause and proposed:

- freezing stacked list body height during task drag
- freezing lane band heights more aggressively during drag
- adding a cooldown or other damping around repeated cross-container flips

That line of thinking was not fully wrong, but it was not the final explanation for this specific crash. A throttle-plus-height-freeze attempt did not eliminate the error, and the eventual fix came from collision filtering plus midpoint gating in `useTaskDndCore()`, not from geometry freezing.

Keep this history only as a caution:

- geometry instability can still be worth checking during drag investigations
- but future readers should not treat geometry freezing as the primary fix for this resolved `Maximum update depth exceeded` issue
- if a similar bug returns, verify the hover collision sequence with runtime evidence before reviving any freeze or cooldown plan

### What not to assume

Do not assume that improving render performance alone will fix this crash.

Do not assume that a stacked-only fix is sufficient now that the same error has been reproduced in lanes layout.

Do not assume that dnd-kit is randomly unstable. The library is measurement-sensitive, and this app is likely exposing a difficult but explainable multi-container hover loop.

### Caution from prior attempt

A prior mitigation attempt combined:

- a short cross-container move cooldown in `useTaskDndCore()`
- a stacked-only height freeze

That attempt did not eliminate the error, so it should not be considered a completed fix. It is kept here only to document a rejected direction.

## Final diagnosis and prevention lessons

The eventual fix was narrower and more mechanical than the earlier theory of "freeze more geometry."

The main failure mode was not just that drag was expensive. It was that optimistic cross-container moves could fire before the dragged task had actually crossed the hovered task's midpoint. Near band boundaries, that let the same drag hover bounce between neighboring tasks or neighboring bands, which kept rewriting the optimistic map and fed dnd-kit's measurement and transform work back into another collision change.

The final diagnosis was:

- task drag should not consider unrelated `list-*` droppables as collision candidates
- `pointerWithin(...)` can temporarily produce no hits near boundaries, so a small amount of collision stabilization is still useful
- the real crash trigger was cross-container task-to-task movement happening too early, before midpoint crossing

The implemented fix in `src/client/components/board/useTaskDndCore.ts` now does all of the following:

- filters task drag collision candidates to task ids and task containers only
- keeps a `lastResolvedTaskCollisionIdRef` fallback for the empty-`pointerWithin(...)` case
- requires midpoint crossing for same-container reorder
- also requires midpoint crossing for cross-container task-to-task moves
- still allows container-level drops so empty-band targeting continues to work

### Prevention guidance for future drag bugs

When a drag bug looks like "performance" but eventually throws `Maximum update depth exceeded`, treat it as a possible feedback loop first, not just a slow render.

Good working assumptions:

- dnd-kit is measurement-sensitive; repeated optimistic DOM changes can create app-side collision churn
- if the stack points into dnd-kit `useDerivedTransform()` or `measureRect(...)`, the library may be surfacing an instability created by this app's hover logic
- hover-time state changes should usually be gated by a visual threshold such as midpoint crossing, not just by "there is an `over` target"

### How this could have been detected earlier

This bug class is easier to find with targeted diagnostics than with generic exception handling alone.

Useful safeguards for future work:

- add a board-scoped or app-scoped `ErrorBoundary` so drag failures are contained and easier to report
- add client-side exception reporting for uncaught React / drag crashes
- keep a manual stress test for "drag across boundaries for a long time without dropping"
- when changing collision logic, explicitly test both stacked and lanes layouts
- instrument collision target changes, pointer hits, and midpoint relationships before attempting a fix

### What not to do next time

- do not assume a throttle or cooldown is a root-cause fix
- do not assume stacked-only geometry tweaks solve a bug that also reproduces in lanes
- do not assume dnd-kit is randomly unstable before ruling out optimistic hover oscillation in app code

## Decision guide for future agents

### Stop after Optimization 1 if:

- drag feels clearly better to the user
- React Profiler shows untouched stacked columns no longer re-render broadly
- the remaining cost is acceptable in production

### Consider Optimization 2 if:

- drag still feels slow after Optimization 1
- React Profiler still shows heavy `SortableTaskRow` / `DndContext` churn across many rows
- Chrome Performance still shows substantial scripting time during drag

## Recommended workflow

1. Apply Optimization 1 first.
2. Re-profile the same stacked-board drag scenario.
3. Compare:
   - number of `BoardListStackedColumn` renders
   - number of `SortableTaskRow` renders
   - largest React commit durations
4. Only plan Optimization 2 if the board is still materially slow.

## Important implementation note

Tasks can be dragged across lists, and Optimization 1 was designed with that in mind.

For cross-list drag, the optimistic update in `useTaskDndCore()` usually changes only:

- the active/source list array
- the over/target list array

That is why per-list `sortableIds` are still correct and useful for both:

- same-list reorder
- cross-list moves

## Current status

- Optimization 1: implemented in the stacked board path
- Optimization 2: not implemented
- Additional issue: the prior `Maximum update depth exceeded` crash was reproduced in both stacked and lanes layouts and was ultimately fixed in `useTaskDndCore()` with collision filtering plus midpoint gating for cross-container task moves
- A prior mitigation attempt did not fully resolve the crash; the final fix came from runtime evidence rather than a throttle-only workaround
- Recommended next step: if future drag work touches collision or optimistic hover behavior, re-run long boundary-hover stress testing in both layouts before landing the change
