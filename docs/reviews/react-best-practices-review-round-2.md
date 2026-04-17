# React Best Practices Review — Round 2 (hirotaskmanager)

Second pass against the `vercel-react-best-practices` skill, **after** the fixes and refactors summarized in [`react-best-practices-review.md`](./react-best-practices-review.md). This document records **what improved**, **what is still open**, and **new** observations. Stack unchanged: **Vite + React 19 SPA** (Next.js / RSC rules remain N/A).

> Policy: initial development mode — no backward-compatibility requirement unless stated; only DB migrations need compatibility ([`no-backward-compatibility.mdc`](../../.cursor/rules/no-backward-compatibility.mdc)).

---

## 1. Executive summary

Round 1 called out bundle weight, missing Suspense, hot-path effects, unstable memo props, Zustand fan-out, and several micro-optimizations. **Most high-impact items are now implemented or materially improved.** The remaining gaps are smaller: incremental Suspense adoption for secondary queries and polish (icon import audit, duplicate skeleton extraction). Parallel `cancelQueries` for patch/create and shared resize in `useVerticalScrollOverflow` were completed after the first round 2 write-up.

**Rough applicable-rule posture vs round 1**

| Area | Round 1 | Round 2 (now) |
|------|---------|----------------|
| Bundle: route / heavy feature splits | ❌ | ✅ routes + lazy features + dynamic celebration |
| `bundle-preload` / `manualChunks` | ❌ | ✅ Vite plugin + chunk groups |
| Radix barrel `radix-ui` | ⚠️ | ✅ scoped `@radix-ui/react-*` |
| Suspense + suspense queries | ❌ | ⚠️ board fetch yes; stats/other queries still optional |
| No-deps / wrong-deps layout effects | ❌ | ✅ addressed (comments cite §2.1) |
| `async-parallel` (cancelQueries) | ⚠️ | ✅ delete + patch + create use `Promise.all` |
| Shared window `resize` | ⚠️ | ✅ including `useVerticalScrollOverflow` |
| `startTransition` / `useDeferredValue` | ⚠️ | ✅ broad header/board usage + search |
| Zustand fan-out / filter context | ⚠️ | ✅ `useShallow`, `BoardFilterResolutionProvider` |
| Rename draft / `commitBoardRename` churn | ❌ | ✅ `BoardEditingProvider` + ref + stable callback |
| Panning cursor as state | ⚠️ | ✅ DOM class toggle |
| `localStorage` versioning | ⚠️ | ✅ `version: 1` + `migrate` on prefs + board filters |
| Map vs `.find` for stats / lists | ⚠️ | ✅ `listStatsByListId`, `listsById` |

---

## 2. Resolved or materially improved (with pointers)

### 2.1 Critical async & loading

- **`async-suspense-boundaries`** — Board route uses `useSuspenseBoard`, `<Suspense fallback={…}>`, and `BoardQueryErrorBoundary` for fetch errors.

```102:106:src/client/components/board/BoardView.tsx
    <BoardQueryErrorBoundary key={boardId}>
      <Suspense fallback={<BoardViewLoadingFallback />}>
        <BoardViewBody boardId={boardId} />
      </Suspense>
    </BoardQueryErrorBoundary>
```

- **`bundle-dynamic-imports`** — Lazy route chunks in `App.tsx`; lazy Mermaid, markdown field, emoji content; dynamic `partycles` load on first celebration (`BoardTaskCompletionCelebrationContext.tsx`).

- **`bundle-barrel-imports` (Radix)** — UI primitives import from `@radix-ui/react-dialog`, `@radix-ui/react-popover`, etc. (see `src/client/components/ui/*.tsx`).

- **`bundle-preload`** — `vite.config.ts` injects `modulepreload` for board-route chunks and defines `manualChunks` (`react-vendor`, `tanstack`, `dnd`, `radix`).

### 2.2 Data fetching & listeners

- **`async-parallel`** — `useDeleteBoard` `onMutate` uses `Promise.all` for independent `cancelQueries`.

- **`client-event-listeners`** — Central `subscribeWindowResize` / `useWindowResize` (`src/client/lib/useWindowResize.ts`); stacked columns and header metrics subscribe to the shared dispatcher.

- **`client-localstorage-schema`** — `preferences.ts` and `boardFilters.ts` use `version: 1` and `migrate` (baseline identity migrations).

### 2.3 Re-renders & memo stability

- **`rerender-move-effect-to-event`** — `useBoardHeaderScrollMetrics` ties sync to scroll / `ResizeObserver` / shared resize (see comment at line 136). `BoardListColumn` uses `ResizeObserver` + explicit deps instead of a no-deps layout loop.

- **`rerender-defer-reads` / filter resolution** — `BoardViewBody` uses `useShallow` for preferences; `BoardFilterResolutionProvider` supplies resolved filters to bands.

- **`rerender-derived-state-no-effect` / rename** — Board title editing lives in `BoardEditingProvider` with `key={data.boardId}` on the provider; `commitBoardRename` reads draft via `boardNameDraftRef` and keeps **stable** `useCallback` deps `[board, patchBoard]`.

- **`rerender-use-ref-transient-values`** — `useBoardCanvasPanScroll` toggles `cursor-grabbing` / `select-none` on the scroller via `classList`, not React state.

- **`rerender-simple-expression-in-memo`** — `BoardTaskCardSizeToggle` inlines `getNextTaskCardViewMode` (no trivial `useMemo`).

- **`rerender-memo-with-default-value` (partial)** — `boardThemeStyle` is `useMemo`; `BoardViewDialogs` uses stable `useCallback` close handlers for dialogs.

- **`rerender-transitions` / `rendering-usetransition-loading` (partial)** — `startTransition` is used for filter strip, card size, date filter, release/task group switchers, shortcuts; `BoardSearchDialog` uses `useDeferredValue` on the debounced query for FTS.

### 2.4 JavaScript micro-rules

- **`js-index-maps`** — `listStatsByListId` `Map` in `BoardView.tsx`; `listsById` in `BoardColumns.tsx` for O(1) list lookup.

- **`js-hoist-regexp`** — `SCROLLABLE_OVERFLOW_RE` in `useBoardHighlightState.ts`; `CODE_BLOCK_LANGUAGE_CLASS_RE` in `taskMarkdownPreviewComponents.tsx`.

- **`js-flatmap-filter`** — `buildBoardFilterSummaries` uses `flatMap` for priority labels (`boardFilterSummaries.ts`).

### 2.5 Advanced patterns

- **`advanced-event-handler-refs` / `advanced-use-latest`** — Addressed for board rename via `boardNameDraftRef` in `BoardEditingContext.tsx`.

---

## 3. Remaining gaps & new findings

### 3.1 ~~MEDIUM — optional `Promise.all` in `onMutate` (`async-parallel`)~~ **Done**

`usePatchBoard` and `useCreateBoard` now `await Promise.all([...])` for `boardKeys.all` and the relevant `boardKeys.detail(...)` (create generates `optimisticId` first so both keys are known). See `src/client/api/mutations/board.ts`.

### 3.2 ~~MEDIUM — `useVerticalScrollOverflow` dedicated `window` listener~~ **Done**

`useVerticalScrollOverflow` uses `subscribeWindowResize(measure)` instead of `addEventListener("resize", …)`. See `src/client/components/board/lanes/useVerticalScrollOverflow.ts`.

### 3.3 LOW — Suspense outside the board query (`async-suspense-boundaries`)

The main board query is suspense-driven; **board stats** (`useBoardStats`) and other secondary queries still use the classic `isLoading` / `isFetching` pattern. That is valid. **Optional:** introduce `useSuspenseQuery` + nested `<Suspense>` for stats rows if you want uniform loading boundaries and simpler child components.

### 3.4 LOW — `overlayTask` still uses `.find` on `board.tasks` (`js-index-maps`)

```287:290:src/client/components/board/columns/BoardColumns.tsx
  const overlayTask =
    activeTaskId != null
      ? board.tasks.find((task) => task.taskId === activeTaskId)
      : undefined;
```

One lookup per render while dragging is cheap; a `Map<taskId, Task>` (memoized from `board.tasks`) would align fully with the rule if task count grows large.

### 3.5 LOW — `lucide-react` imports (`bundle-barrel-imports`)

~30 files still use package root imports. Tree-shaking with Vite usually handles named exports; **optional:** confirm with `rollup-plugin-visualizer` or per-icon paths for the heaviest screens.

### 3.6 LOW — duplicate loading skeletons (`rendering-hoist-jsx`)

`BoardViewLoadingFallback` and `RouteSuspenseFallback` in `App.tsx` are visually similar pulse placeholders. **Optional:** extract one shared skeleton component to avoid drift.

### 3.7 LOW — React 19 `Activity` (`rendering-activity`)

Not used. Worth revisiting only if you have expensive subtrees that mount/unmount often and you want preserved state; not urgent for current dialog patterns.

---

## 4. Compliance snapshot (round 2)

Applicable rules only (excluding Next/RSC-only). Status is **directional** after fixes, not a full line-by-line re-audit of all 70 rules.

| Category | Notes |
|----------|--------|
| 1. Waterfalls | Board suspense ✅; patch/create/delete parallel cancel ✅ |
| 2. Bundle | Routes, lazy features, chunks, preload ✅; lucide audit optional ⚠️ |
| 3. Server | ➖ N/A |
| 4. Client fetch | TanStack Query ✅; shared window resize across hooks ✅ |
| 5. Re-renders | Large wins landed ✅; continue memo audits as new props appear |
| 6. Rendering | Virtualized lanes ✅; optional Activity / shared skeleton ⚠️ |
| 7. JS perf | Maps / hoisted regex / flatMap ✅ |
| 8. Advanced | Ref-based rename ✅ |

---

## 5. Suggested sequencing (round 2)

1. **Optional:** shared route/board skeleton component; Suspense for stats; task `Map` for drag overlay (see §3.3–3.4).

---

## 6. Reference

- Round 1 (baseline): [`react-best-practices-review.md`](./react-best-practices-review.md)
- Skill: `.agents/skills/vercel-react-best-practices/SKILL.md`
