# Phase 1 profiling analysis — 1000-task board

Analysis of React DevTools Profiler exports (6 scenarios) and Chrome Performance traces (4 scenarios) recorded on a board with 1000 tasks in stacked layout.

Data sources:

- `docs/profiling/step1-profiler-summary.txt` — React Profiler (per-component render times, commit durations, updater attribution)
- `docs/chrome-profiling/chrome-trace-summary.txt` — Chrome Performance (long tasks, GC, layout/paint, event dispatch)

---

## 1. Scenario-by-scenario findings

### 1.1 Initial board load

| Metric | React Profiler (no stats) | React Profiler (with stats) | Chrome trace |
|--------|--------------------------|----------------------------|--------------|
| Commits | 10 | 12 | — |
| Slowest commit | 966.8 ms | 895.2 ms | — |
| Total commit duration | 4,122.7 ms | 4,752.8 ms | — |
| Longest RunTask | — | — | 14,703.8 ms |
| GC wall time | — | — | 9,343.9 ms (5,176 slices) |
| Layout/paint wall time | — | — | 535.2 ms |
| Layout dirty objects | — | — | 17,878 |

**Key observations:**

- A single unbroken RunTask of **14.7 seconds** blocks the main thread during initial render. This is React's synchronous render of 1000 `SortableTaskRow` components. `performWorkUntilDeadline` is the top-level caller, confirming React's scheduler is the entry point.
- **GC is catastrophic during load:** 9.3 seconds of garbage collection across 5,176 slices — that's nearly as much time as the render itself. 115 minor GC cycles (scavenger) averaging 11.7 ms each, plus 11 major GC cycles including a 118.9 ms `MajorGC` that reclaimed from 145 MB down to 25 MB heap. This points to massive short-lived object allocation during mount — likely from creating and discarding arrays/objects in filter/sort/map chains and dnd-kit hook registrations.
- The React Profiler shows the slowest commit at ~967 ms with a fiber sum of 18,987 ms (inclusive time across all fibers). The gap between commit duration and fiber sum confirms deep nesting — the same wall time is attributed to every ancestor in the tree.
- The top-level component cascade during load: `BoardView` → `ShortcutScopeProvider` → `BoardStatsDisplayProvider` → `BoardTaskKeyboardBridgeProvider` → `BoardTaskCompletionCelebrationProvider` → `BoardKeyboardNavProvider` → `BoardColumnsStacked` → `DragDropProvider`. Every one of these renders in 880–967 ms because they are a single-threaded chain wrapping the same children.
- Second commit during load takes 854 ms with updaters `ListStackedBody×50, Popper×50, Presence×50` — this is the effect-driven mount phase where 50 lists' bodies + their dropdown menus mount and trigger re-renders.
- After the initial two heavy commits, `BoardKeyboardNavProvider` triggers two more commits of 696 ms and 599-645 ms — likely the keyboard nav context registering all task elements and causing cascading re-renders.
- With board stats enabled, an additional 182.8 ms commit appears from `StatChip×4`, plus slightly higher total effect time (11,030 ms vs 6,898 ms). The stats feature adds moderate overhead but is not the primary bottleneck.

### 1.2 Hovering over 10+ cards

| Metric | React Profiler | Chrome trace |
|--------|---------------|--------------|
| Commits | 20 | (not recorded separately) |
| Mean commit duration | 536.0 ms | — |
| Max commit duration | 636.8 ms | — |
| Total commit duration | 10,719.6 ms | — |
| Layout/effect duration | 27,839.1 ms | — |

**Key observations:**

- **Every single one of the 20 commits is triggered solely by `BoardKeyboardNavProvider`.** The slowest commits table shows 12 entries, all with updater `BoardKeyboardNavProvider`, ranging from 588.1 to 636.8 ms. This is the clearest smoking gun in all the data.
- Each hover event causes a full board re-render of all 1000 tasks. The sample counts prove this: `SortableTaskRow` has 18,000 samples across 20 commits = 900 re-renders per commit. With 50 lists × ~20 tasks each, that is the entire board re-rendering on every `pointerenter`.
- Layout/effect time is enormous: 27,839 ms total, averaging ~1,392 ms per commit. This suggests expensive DOM effects (likely `registerTaskElement` and dnd-kit sortable hook setup) re-running on every hover-triggered render.
- The cost breakdown per commit: ~636 ms commit duration + ~1,500 ms in layout effects + ~10 ms passive effects. The effects are **more expensive than the render itself**.
- Component time distribution in hover is remarkably uniform — `BoardListStackedColumn` at 10,587 ms, `ListStackedBody` at 10,463 ms, `StackedSortableList` at 8,817 ms — nearly identical to the parent, confirming these are just passing through to children without meaningful bail-out.

### 1.3 Scrolling (up and down, one list)

| Metric | React Profiler | Chrome trace |
|--------|---------------|--------------|
| Commits | 10 | — |
| Mean commit duration | 414.6 ms | — |
| Max commit duration | 642.4 ms | — |
| Longest RunTask | — | 4,285.7 ms |
| GC wall time | — | 1,274.5 ms |
| Layout/paint wall time | — | 57.9 ms |

**Key observations:**

- **Scrolling triggers full React re-renders**, not layout-only work. The Chrome trace shows four massive RunTask slices (3.4–4.3 seconds each) that are pure JS execution — layout/paint is only 57.9 ms total. The cost is entirely in React component re-rendering.
- The React Profiler confirms: 7 of the 10 commits are 564–642 ms each, all triggered by `BoardKeyboardNavProvider`. The remaining 3 commits are 10.3 ms no-ops. This means scrolling triggers `BoardKeyboardNavProvider` state changes (likely through intersection observers or scroll-related hover events) which cascade into full board re-renders.
- 7,000 `SortableTaskRow` samples across 10 commits = 1,000 re-renders per meaningful commit × 7 commits. The entire task list re-renders on every scroll-triggered state change.
- GC during scroll (1,274.5 ms) is moderate but non-trivial — 51 minor GC cycles. The scroll interaction creates enough garbage to trigger a scavenge every ~300 ms.

### 1.4 Drag and drop

| Metric | React Profiler | Chrome trace |
|--------|---------------|--------------|
| Commits | 27 | — |
| Mean commit duration | 247.0 ms | — |
| Max commit duration | 750.4 ms | — |
| Longest RunTask | — | 5,569.1 ms |
| GC wall time | — | 1,309.3 ms |
| Layout/paint wall time | — | 2,404.6 ms |

**Key observations:**

- DnD is the most complex scenario with the widest variety of updaters. The slowest commits involve different combinations: `BoardKeyboardNavProvider` alone (750 ms), `BoardColumnsStacked + BoardKeyboardNavProvider` (699 ms), `BoardKeyboardNavProvider + BoardView` (680 ms), and `BoardColumnsStacked + BoardKeyboardNavProvider + DragOverlay + SortableTaskRow` (617 ms).
- The Chrome trace shows the initial **pointerdown** event takes **4,223 ms** — over 4 seconds from mousedown to the drag starting. This is the time to set up the drag context, snapshot all sortable positions, and render the drag overlay. Nested inside: `EventDispatch(pointerdown)` 4,215 ms → `RunMicrotasks` 4,211 ms → `FunctionCall` 4,211 ms.
- A subsequent **pointermove** event takes **1,297 ms** — each mouse movement during drag triggers collision detection and re-rendering that takes over a second.
- **Layout thrashing is significant during DnD:** 2,404.6 ms in layout/paint events. The trace shows `UpdateLayoutTree` slices of **380.9 ms** and **347.1 ms** — the 380 ms one touches **15,253 elements**. This confirms the plan's hypothesis about forced reflows. During drag, dnd-kit likely reads element positions (triggering style recalculation on 15,000+ elements) then writes to the DOM, causing layout thrashing.
- Layout cost during DnD is the highest of all scenarios (367 layout/paint slices totaling 2.4 seconds vs. 57.9 ms during scroll, 535 ms during load). This is a unique DnD problem.
- `IntersectionObserverController::computeIntersections` appears at 89.6 ms (37 calls) — this is dnd-kit's sortable sensors observing element visibility, adding overhead on every drag movement.
- Effect durations in the React Profiler are very high: 6,419 ms total layout/effect across 27 commits. Several commits show ~1,500 ms in effects alone, suggesting sortable hook cleanup and re-registration on drag events.
- 10,174 `SortableTaskRow` samples across 27 commits ≈ 377 per commit on average. Not every commit re-renders all 1000 tasks (some commits are lighter drag-over updates), but the heavy ones clearly do.

### 1.5 Toggling group filter ("Feature")

| Metric | React Profiler | Chrome trace |
|--------|---------------|--------------|
| Commits | 33 | — |
| Total commit duration | 13,895.3 ms | — |
| Max commit duration | 674.6 ms | — |
| Longest RunTask | — | 4,211.9 ms |
| GC wall time | — | 1,162.9 ms |
| Layout/paint wall time | — | 145.1 ms |

**Key observations:**

- Filter toggle produces the **most commits** (33) of any scenario. The first commit is 674.6 ms (updater: `BoardView`) with a fiber sum of 12,730 ms. Then 26 subsequent commits are clustered at exactly 617.2 ms each — these are the cascading re-renders from `Presence`, `PopperContent`, `DismissableLayer`, `FocusScope`, `MultiSelect`, and `Portal` components.
- The 617.2 ms cluster is suspicious: 26 commits at nearly identical duration suggests a single expensive render tree being triggered repeatedly by animation/transition components (Presence, DismissableLayer) as the filter popover opens/closes. These components are from Radix UI and produce cascading state updates during mount/unmount transitions.
- `BoardColumnsStacked` has 13,563 ms across 32 samples — essentially re-rendering on every commit. This is the main content area being fully re-rendered each time.
- Only 2,520 `SortableTaskRow` samples (vs 18,000 for hover) — the filter reduces the visible task count, so fewer task components render. But `BoardColumnsStacked` still renders 32 times because the filter toggle changes state at a level that invalidates the entire board.
- The Chrome trace shows this is almost entirely JS: layout/paint is only 145 ms. The 4.2-second `RunTask` is a `click` event dispatch that triggers the full re-render cascade.
- A second significant click event at 605 ms suggests toggling the filter back triggers another expensive re-render.

---

## 2. Cross-cutting findings

### 2.1 BoardKeyboardNavProvider is the #1 re-render trigger

Across all interactive scenarios (hover, scroll, drag), `BoardKeyboardNavProvider` is the primary or sole updater in the vast majority of expensive commits:

| Scenario | Expensive commits with BoardKeyboardNavProvider as updater |
|----------|----------------------------------------------------------|
| Hover | 20/20 (100%) |
| Scroll | 7/7 meaningful commits (100%) |
| Drag | 8/8 of the top expensive commits |
| Load | 5/10 commits |

This single context provider is responsible for the most devastating performance problem: **every pointer interaction triggers a state change that cascades into a full re-render of all 1000 tasks**.

The plan's hypothesis (#2 — debounce/ref-ify hover state) is confirmed as the highest-impact quick win. But the data reveals the problem is worse than expected: it's not just hover — scroll and drag also trigger `BoardKeyboardNavProvider` updates.

### 2.2 The full re-render cascade

Every expensive commit follows the same pattern — the entire component tree re-renders top to bottom:

```
BoardKeyboardNavProvider (or BoardView)
  → BoardColumnsStacked
    → DragDropProvider
      → BoardListStackedColumn × 50
        → ListStackedBody × 50
          → StackedSortableList × 50
            → StackedSortableTaskRowById × 1000
              → SortableTaskRow × 1000
                → TaskCard × 1000
                  → TaskCardContent × 1000
```

No component in this chain successfully bails out of rendering. `React.memo` is either not applied or is defeated by unstable prop references (the `board` object).

### 2.3 Effect cost is often higher than render cost

In hover, layout/effect duration (27,839 ms) is **2.6× the commit duration** (10,720 ms). This means the DOM side-effects (likely `registerTaskElement`, dnd-kit sortable setup, ref callbacks) are more expensive than the React reconciliation itself. Fixing the re-render problem will also fix the effect problem — effects won't re-run if components don't re-render.

### 2.4 GC pressure scales with scenario complexity

| Scenario | GC wall time | GC slices | GC per second of trace |
|----------|-------------|-----------|----------------------|
| Load | 9,343.9 ms | 5,176 | ~500 ms/s |
| DnD | 1,309.3 ms | 895 | ~100 ms/s |
| Scroll | 1,274.5 ms | 1,475 | ~80 ms/s |
| Filter toggle | 1,162.9 ms | 1,230 | ~90 ms/s |

Load is catastrophic because mount creates and discards the most objects (hook closures, arrays, objects for 1000 components). The MajorGC during load (118.9 ms, reclaiming 145 MB → 25 MB) shows just how much garbage the initial render produces.

Interactive scenarios have moderate but persistent GC pressure — roughly 1 scavenger pause every 250–500 ms. Individual pauses are small (< 30 ms) but they add up and contribute to frame jank.

### 2.5 Layout thrashing is DnD-specific

| Scenario | Layout/paint wall time | UpdateLayoutTree max |
|----------|----------------------|---------------------|
| DnD | 2,404.6 ms | 380.9 ms (15,253 elements) |
| Load | 535.2 ms | 235.6 ms |
| Scroll | 57.9 ms | 8.0 ms |
| Filter toggle | 145.1 ms | 6.0 ms |

DnD has **40× more layout cost than scroll** and **16× more than filter toggle**. The 380.9 ms `UpdateLayoutTree` touching 15,253 elements is a forced style recalculation — dnd-kit reading sortable element positions during drag triggers this. The plan's hypothesis about layout thrashing (#5 — reduce DnD collision scope) is strongly confirmed.

### 2.6 The pointerdown → drag-start penalty

The Chrome DnD trace reveals a 4.2-second penalty just to start a drag. This is not gradual — it's a single synchronous block from `pointerdown` through `RunMicrotasks` to `FunctionCall`. During this time:
- dnd-kit snapshots positions of all 1000 sortable elements
- The drag context is established, triggering a full board re-render
- Layout is forced to compute positions for the overlay

This startup cost means the user sees a ~4 second freeze between clicking and the drag starting.

---

## 3. Validation of plan hypotheses

| Plan item | Hypothesis | Confirmed? | Evidence | Notes |
|-----------|-----------|------------|----------|-------|
| #1 Pre-index tasks | O(N×B) filter/sort per render | Likely (indirect) | `BoardColumnsStacked` re-renders 32× in filter toggle, each time re-filtering | Not directly measured; needs Step 3 instrumentation to quantify |
| #2 Debounce hover state | Hover triggers context re-renders | **Strongly confirmed** | 20/20 hover commits from `BoardKeyboardNavProvider`, 18,000 SortableTaskRow re-renders | Worse than expected: also triggers on scroll and during drag |
| #3 Trim body from payload | Megabytes of unused body text | Likely (not directly measured) | Load GC reclaims 145→25 MB; large payload would contribute | Need to measure actual payload size separately |
| #4 Stop passing full `board` | New reference defeats React.memo | **Strongly confirmed** | Zero bail-outs anywhere in the tree; every child re-renders on every commit | The full cascade from §2.2 proves no component successfully memoizes |
| #5 Reduce DnD collision scope | Collision detection against 1000 sortables | **Strongly confirmed** | 4.2s pointerdown block, 380ms UpdateLayoutTree on 15,253 elements, 89.6ms IntersectionObserver cost | Layout thrashing is DnD-specific and severe |
| #6 Virtualize task lists | 1000 mounted components = root cause | **Strongly confirmed** | 18,000 SortableTaskRow samples in hover (1000 × 18 re-renders), 14.7s initial RunTask, 17,878 dirty layout objects | Every metric points to component count as the fundamental problem |
| #7 Cheaper container map sig | String ops with 1000 tasks | Not directly measured | — | Low priority; needs Step 3 instrumentation |

---

## 4. Observations the plan did not anticipate

### 4.1 Effect cost dominance

The plan focused on render cost, but the profiler shows layout/effect durations that **exceed commit durations** in hover (27.8s effects vs 10.7s commits) and load (6.9–11.0s effects vs 4.1–4.8s commits). The effects — likely `registerTaskElement`, dnd-kit sortable `useLayoutEffect` hooks, and Popper positioning — are a major cost center. The plan's optimizations will indirectly fix this (fewer re-renders = fewer effect runs), but it's worth noting that effect cleanup/re-run is the dominant cost for hover, not reconciliation.

### 4.2 Scroll re-renders through BoardKeyboardNavProvider

The plan mentions hover as the trigger for `BoardKeyboardNavProvider`, but scroll also triggers it — 7 of 10 scroll commits are from `BoardKeyboardNavProvider`. This may be intersection observers or scroll-position-based hover events. The debounce/ref-ify fix needs to cover scroll-triggered state changes too, not just `pointerenter`.

### 4.3 Filter toggle produces cascading Radix UI re-renders

The 26 commits at exactly 617.2 ms in the filter toggle scenario are from Radix UI components (`Presence`, `DismissableLayer`, `FocusScope`, `PopperContent`, `MultiSelect`). The filter popover's open/close transition generates dozens of state updates that each cause a full board re-render because nothing in the tree bails out. This is a compounding problem: the Radix cascade wouldn't matter if child components could memoize, but since `board` is always a new reference, every Radix state update triggers a 617 ms re-render.

### 4.4 Popper/Presence mount during load

The second-heaviest load commit (854 ms) is triggered by `ListStackedBody×50, Popper×50, Presence×50`. Each of the 50 list sections mounts a dropdown menu (Popper) and animation wrapper (Presence) that triggers a re-render. These components should be lazily mounted — there's no reason to mount 50 dropdown menus on initial board load.

### 4.5 IntersectionObserver overhead during DnD

`IntersectionObserverController::computeIntersections` at 89.6 ms (37 calls) during drag is a non-trivial cost. These are dnd-kit's sortable sensors observing visibility of all 1000 registered elements. Virtualization will eliminate most of these (fewer registered elements), but even before that, the custom collision strategy (#5) should consider whether the intersection observers can be paused during active drag.

---

## 5. Revised priority assessment

Based on the data, the plan's items can be re-ranked by measured impact:

### Tier 1 — Highest measured impact (do first)

1. **Debounce/ref-ify BoardKeyboardNavProvider state** (plan #2) — eliminates the single biggest trigger of unnecessary re-renders across hover, scroll, and drag. Every interactive scenario is dominated by this. Estimated savings: eliminates ~90% of re-renders in hover and scroll scenarios.

2. **Stop passing full `board` as prop / enable memoization** (plan #4) — even after fixing the trigger, other sources of re-renders exist (Radix UI cascades, BoardView updates). Stable props + `React.memo` would let subtrees bail out. Estimated savings: when a re-render does occur, only affected subtrees re-render instead of all 1000 tasks.

### Tier 2 — High impact, addresses load and DnD

3. **Virtualize task lists** (plan #6) — the fundamental fix for load time (14.7s → targeting <2s), memory usage, and GC pressure. Also slashes DnD collision scope by reducing registered sortables from 1000 to ~50 visible.

4. **Reduce DnD collision scope** (plan #5) — 4.2s pointerdown block and 380ms layout thrashing are DnD-specific. Virtualization helps, but a custom collision strategy is needed regardless to avoid reading positions of all visible sortables.

### Tier 3 — Incremental wins

5. **Pre-index tasks by (listId, status)** (plan #1) — still a good idea but the data shows render cascade is a far bigger problem than filter/sort cost. Worth doing as prep for #4 (stable slices for memoization).

6. **Lazy-mount Popper/Presence on list headers** (new) — saves 854 ms on second load commit by not mounting 50 dropdown menus eagerly. Low effort.

7. **Trim body from payload** (plan #3) — reduces network transfer and initial parse time. Will help GC pressure during load but hard to quantify without measuring payload size.

8. **Cheaper container map signature** (plan #7) — lowest priority. Not directly measurable from current data.

---

## 6. Suggested baselines for success criteria

Measured baselines from this profiling session (1000-task board):

| Metric | Baseline (measured) | Plan target |
|--------|-------------------|-------------|
| Board load (longest RunTask) | 14,703 ms | < 2,000 ms |
| Hover per-commit duration | 536–637 ms | < 16 ms (1 frame) |
| Hover commits per 10 cards | 20 | 0 (or 1–2 if keyboard is active) |
| Scroll longest RunTask | 4,285 ms | < 16 ms |
| Drag pointerdown block | 4,223 ms | < 200 ms |
| Drag pointermove block | 1,297 ms | < 50 ms |
| Filter toggle total commit time | 13,895 ms | < 200 ms |
| Load GC wall time | 9,344 ms | < 500 ms |
| Load layout dirty objects | 17,878 | < 2,000 |
| DnD UpdateLayoutTree max | 380.9 ms | < 16 ms |
