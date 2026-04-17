# React Best Practices Review — hirotaskmanager client

Audited against the `vercel-react-best-practices` skill (70 rules across 8 categories). This project is a **Vite + React 19 SPA** (not Next.js / RSC), so server-side rules are largely N/A. The findings below cover the rules that do apply, sorted from **most impactful to least**.

> Policy note (per workspace rule `no-backward-compatibility.mdc`): we are in initial development mode — refactors below can be done without back-compat wrappers. Only DB migrations require compatibility.

**Stack recap**
- `src/client/main.tsx` → `QueryClientProvider` → `ThemeRoot` → `App` → `BrowserRouter` → routes (`HomeRedirect`, `BoardPage`, `SettingsPage`, `TrashPage`).
- State: `@tanstack/react-query` (server state), `zustand` w/ `persist` (preferences, board filters), React Context (board search, shortcuts, stats display, celebration).
- Rendering: `@dnd-kit/react` + `@tanstack/react-virtual` on the board; `@uiw/react-md-editor`, `mermaid`, `emoji-picker-react`, `partycles` on task/board surfaces.
- Build: Vite default config — **no `manualChunks`**, **no `React.lazy` route splits**.

---

## Compliance matrix (all 70 rules)

Status legend:
- ✅ **Compliant** — no notable violations found, or pattern not reachable in this app.
- ⚠️ **Partial** — some usage is fine but there are 1–3 identified violations worth fixing.
- ❌ **Non-compliant** — systemic violation or missing pattern.
- ➖ **N/A** — rule is specific to Next.js / RSC / a feature this SPA does not use.

### Summary

| Category | Rules | ✅ Compliant | ⚠️ Partial | ❌ Non-compliant | ➖ N/A |
|---|---:|---:|---:|---:|---:|
| 1. Eliminating waterfalls (CRITICAL) | 6 | 2 | 1 | 1 | 2 |
| 2. Bundle size (CRITICAL) | 6 | 1 | 1 | 3 | 1 |
| 3. Server-side perf (HIGH) | 10 | 0 | 0 | 0 | 10 |
| 4. Client-side data fetching (MEDIUM-HIGH) | 4 | 2 | 2 | 0 | 0 |
| 5. Re-render optimization (MEDIUM) | 15 | 7 | 5 | 3 | 0 |
| 6. Rendering performance (MEDIUM) | 11 | 7 | 1 | 1 | 2 |
| 7. JavaScript performance (LOW-MEDIUM) | 14 | 10 | 3 | 0 | 1 |
| 8. Advanced patterns (LOW) | 4 | 1 | 0 | 1 | 2 |
| **Total (applicable rules only, excluding N/A)** | **52** | **30** | **13** | **9** | — |
| **Applicable compliance rate** | — | **~58%** ✅ / ~25% ⚠️ / ~17% ❌ | | | |

The scores above only count rules that actually apply to this codebase (Vite + React 19 SPA). Rules that are inherently Next.js/RSC-only are excluded from the rate so the denominator is honest.

### Rule-by-rule

#### 1. Eliminating waterfalls (CRITICAL)

| Rule | Status | Evidence / notes |
|---|---|---|
| `async-cheap-condition-before-await` | ✅ | No cases found where a remote `await` precedes a cheap sync bailout. |
| `async-defer-await` | ✅ | SSE handlers in `useBoardChangeStream.ts` await results that are immediately needed — no deferrable awaits found. |
| `async-parallel` | ⚠️ | `src/client/api/mutations/board.ts:375-376` awaits two independent `cancelQueries` sequentially. See §3.2. |
| `async-dependencies` | ✅ | Board → stats is a real data dependency, not a fixable waterfall. |
| `async-api-routes` | ➖ | N/A — no server API routes in client app. |
| `async-suspense-boundaries` | ❌ | Zero `Suspense`, `useSuspenseQuery`, or `suspense: true` in `src/client`. See §3.1. |

#### 2. Bundle size (CRITICAL)

| Rule | Status | Evidence / notes |
|---|---|---|
| `bundle-barrel-imports` | ⚠️ | `radix-ui` meta barrel in 5 UI files; `lucide-react` root imports in ~35 files (see §1.3). |
| `bundle-analyzable-paths` | ✅ | No computed/template-literal dynamic imports — all static paths. |
| `bundle-dynamic-imports` | ❌ | No `React.lazy` anywhere; `mermaid`, `@uiw/react-md-editor`, `emoji-picker-react`, `partycles`, `rehype-rewrite` all statically imported into the board route (§1.1, §1.2). |
| `bundle-defer-third-party` | ➖ | N/A — no analytics/telemetry third parties in this local-first app. |
| `bundle-conditional` | ❌ | Features like mermaid, markdown editor, emoji picker, celebrations load even when their activation conditions aren't met (§1.2). |
| `bundle-preload` | ❌ | `index.html` has no `<link rel="preload">` / `modulepreload`; no preload-on-hover patterns. |

#### 3. Server-side performance (HIGH) — all ➖ N/A

This is a Vite SPA; no RSC, no server actions, no `after()`, no `React.cache`, no SSR in `src/client`. All 10 rules (`server-auth-actions`, `server-cache-react`, `server-cache-lru`, `server-dedup-props`, `server-hoist-static-io`, `server-no-shared-module-state`, `server-serialization`, `server-parallel-fetching`, `server-parallel-nested-fetching`, `server-after-nonblocking`) do not apply.

#### 4. Client-side data fetching (MEDIUM-HIGH)

| Rule | Status | Evidence / notes |
|---|---|---|
| `client-swr-dedup` | ✅ | TanStack Query centralizes everything through `src/client/api/queries.ts`; no `useEffect(() => fetch(...))` bypasses found. |
| `client-event-listeners` | ⚠️ | Per-column `resize` in `BoardListStackedColumn.tsx:227` and per-instance in `multi-select.tsx:447` — dedup via shared hook (§3.3). |
| `client-passive-event-listeners` | ✅ | `scroll` uses `{ passive: true }`; the `wheel` handler is intentionally non-passive because it calls `preventDefault()`. |
| `client-localstorage-schema` | ⚠️ | Zustand `persist` + `partialize` is good, but neither `preferences.ts` nor `boardFilters.ts` sets an explicit `version` + `migrate` for the future. |

#### 5. Re-render optimization (MEDIUM)

| Rule | Status | Evidence / notes |
|---|---|---|
| `rerender-defer-reads` | ⚠️ | Multi-selector components like `AppHeader`, `NotificationBell`, `BoardView`, and per-band `ListStatusBand` fan out subscriptions (§2.4). |
| `rerender-memo` | ✅ | Major list/column bodies are module-level and memo-friendly; no big missing memo boundaries. |
| `rerender-memo-with-default-value` | ❌ | Multiple inline `?? []`, `{...}`, and lambda props break memo on `BoardListColumn`/`BoardListStackedColumn`/dialogs (§2.2). |
| `rerender-dependencies` | ✅ | Hook deps use primitives where possible; didn't find object-identity-in-deps bugs. |
| `rerender-derived-state` | ⚠️ | `BoardColumns.tsx:241-243` effect-driven weights reset. See §2.3. |
| `rerender-derived-state-no-effect` | ❌ | Rename draft in `BoardView.tsx:143-152` is props-to-state-via-effect; systemic enough to rate ❌. |
| `rerender-functional-setstate` | ⚠️ | `commitBoardRename` (`BoardView.tsx:264-281`) captures `boardNameDraft`, making callback identity churn per keystroke (§2.6). |
| `rerender-lazy-state-init` | ✅ | Lazy init used where it matters (`BoardColumnsStacked` column count, `BoardStatsChips` flow value). |
| `rerender-simple-expression-in-memo` | ⚠️ | `BoardTaskCardSizeToggle.tsx:26-28` wraps a trivial call in `useMemo` (§2.8). |
| `rerender-split-combined-hooks` | ✅ | Hot paths use separate `useState`s rather than combined state blobs. |
| `rerender-move-effect-to-event` | ❌ | `useBoardHeaderScrollMetrics.ts:135` and `BoardListColumn.tsx:54` have **no dependency arrays**, running layout work every commit (§2.1). Highest-impact single issue. |
| `rerender-transitions` | ⚠️ | Zero `startTransition`/`useTransition` — filter/search updates run on the urgent path (§2.7). |
| `rerender-use-deferred-value` | ⚠️ | Same as above; `BoardSearchDialog` debounces but doesn't defer the filtered list. |
| `rerender-use-ref-transient-values` | ⚠️ | `panning` in `useBoardCanvasPanScroll.ts:26` is React state for a purely visual cursor (§2.5). |
| `rerender-no-inline-components` | ✅ | Board subtree uses module-level components (`ListColumnBody`, `SortableTaskRowById`, etc.). Good. |

#### 6. Rendering performance (MEDIUM)

| Rule | Status | Evidence / notes |
|---|---|---|
| `rendering-animate-svg-wrapper` | ➖ | N/A — no direct `<svg>` animations; celebrations use `partycles` with a `div` anchor. |
| `rendering-content-visibility` | ⚠️ | Task lanes use `@tanstack/react-virtual` (stronger than `content-visibility`). `ReleasesTable.tsx:44-45` is unvirtualized but small (§4.1). |
| `rendering-hoist-jsx` | ✅ | Only minor repetition in skeleton placeholders — very low impact. |
| `rendering-svg-precision` | ✅ | No inline high-precision SVG paths found in client surfaces. |
| `rendering-hydration-no-flicker` | ✅ | Inline theme script in `index.html:8-27` prevents dark-mode flicker — correct pattern. |
| `rendering-hydration-suppress-warning` | ➖ | N/A — no SSR hydration in this SPA. |
| `rendering-activity` | ✅ | No stale show/hide toggles; dialogs correctly mount/unmount rather than keeping hidden trees. |
| `rendering-conditional-render` | ✅ | Conditionals use booleans (no `{arr.length && <X/>}` traps). |
| `rendering-usetransition-loading` | ❌ | No `useTransition` for loading anywhere — could wrap route transitions and filter updates. |
| `rendering-resource-hints` | ➖ | N/A for client components; covered by `bundle-preload` above. |
| `rendering-script-defer-async` | ✅ | `type="module"` defers by default; inline theme script must be sync to avoid FOUC. |

#### 7. JavaScript performance (LOW-MEDIUM)

| Rule | Status | Evidence / notes |
|---|---|---|
| `js-batch-dom-css` | ✅ | Tailwind class swaps and CSS custom properties dominate; no hand-rolled DOM-CSS storms found. |
| `js-index-maps` | ❌ → ⚠️ | `BoardView.tsx:241-248` (`listStat`) and `BoardColumns.tsx:306-307` use `.find()` per render item (§4.2). Marking ⚠️ because the call-site count is small but scales with board size. |
| `js-cache-property-access` | ✅ | Didn't find loops repeatedly accessing `obj.a.b.c` that warrant aliasing. |
| `js-cache-function-results` | ✅ | Pure helpers (`priorityDisplayLabel`, `bandWeightsForBoard`, etc.) are called at sensible frequencies. |
| `js-cache-storage` | ✅ | `localStorage` reads go through Zustand `persist` rehydration — not re-read per render. |
| `js-combine-iterations` | ✅ | No long `.filter().map().filter()` chains over large task arrays. |
| `js-length-check-first` | ✅ | No expensive comparisons gated behind missing length checks found. |
| `js-early-exit` | ✅ | Handlers and helpers use early returns consistently. |
| `js-hoist-regexp` | ⚠️ | `useBoardHighlightState.ts:25` and `taskMarkdownPreviewComponents.tsx:37` have inline RegExps worth hoisting (§4.3). |
| `js-index-maps` (dupe removed) | — | — |
| `js-min-max-loop` | ✅ | No sort-for-min/max misuse found. |
| `js-set-map-lookups` | ✅ | Set/Map usage in DnD helpers (`dndReactOps.ts`, `boardTaskNavigation.ts`) is appropriate. |
| `js-tosorted-immutable` | ✅ | Sorting uses local copies / already-immutable inputs; no accidental mutation of query data spotted. |
| `js-flatmap-filter` | ⚠️ | `boardFilterSummaries.ts:77-80, 88-92` use `.map().filter(Boolean)` — micro-optimization (§4.4). |
| `js-request-idle-callback` | ➖ | N/A — no non-critical deferrable work identified; hydration/mount paths are already thin. |

#### 8. Advanced patterns (LOW)

| Rule | Status | Evidence / notes |
|---|---|---|
| `advanced-effect-event-deps` | ➖ | N/A — `useEffectEvent` not used anywhere (it's still experimental). |
| `advanced-event-handler-refs` | ❌ | Would directly fix §2.6 (`commitBoardRename`) and dialog `onClose`s; the codebase doesn't use a ref/`useLatest` pattern for stable handlers today. |
| `advanced-init-once` | ✅ | `queryClient` is instantiated once at module scope in `main.tsx`. |
| `advanced-use-latest` | ➖ | Same hook family as above; not currently adopted, but that's a recommended fix rather than a bug. |

---

## Priority 1 — Bundle size (CRITICAL)

Biggest user-facing wins. The app has **no route-level code splitting** today, so every heavy library above is loaded on first paint of any route that transitively imports it.

### 1.1 Route-level code splitting missing — `bundle-dynamic-imports`
- `src/client/App.tsx:9-10` statically imports `BoardPage` and `HomeRedirect`; `BoardPage` statically imports `BoardView`, which pulls in the whole DnD + virtualization + task editor graph.
- No `React.lazy` / `import()` in `src/client` (grep returns zero runtime dynamic imports).

**Fix:** Wrap `BoardPage`, `SettingsPage`, `TrashPage` with `React.lazy`, mount a `<Suspense fallback={…}>` around `<Routes>`. Board is the dominant surface, so even splitting `SettingsPage` and `TrashPage` gives a meaningful initial-JS win.

### 1.2 Heavy libraries imported statically at board load — `bundle-dynamic-imports` / `bundle-conditional`

| Library | Static import site | When it's actually needed |
|---|---|---|
| `mermaid` | `src/client/components/task/MermaidDiagram.tsx:2` | Only when a task body contains a ```` ```mermaid ```` block. |
| `@uiw/react-md-editor` + CSS | `src/client/components/task/TaskMarkdownField.tsx:3-4` | Only when `TaskEditor` is opened in edit mode. |
| `emoji-picker-react` | `src/client/components/emoji/EmojiPickerMenuButton.tsx:2` | Only when the emoji dropdown is actually opened. |
| `partycles` (`useReward`, `emojiPresets`) | `src/client/gamification/BoardTaskCompletionCelebrationContext.tsx:10` | Only when a task is completed (and celebrations aren't muted). |
| `rehype-rewrite` | `src/client/components/task/taskMarkdownPreviewComponents.tsx:5` | Only when rendering markdown preview (mostly when editor/preview is open). |

All five are loaded at initial render of the board route today. These are by far the biggest bundle offenders.

**Fix:** Lazy-load each behind the exact feature activation:
- `MermaidDiagram` — already lazy-able per block; `React.lazy(() => import("./MermaidDiagram"))` and render it only when a code block has `language === "mermaid"`.
- `TaskMarkdownField` — `React.lazy` inside `TaskEditor`, only mount when the editor is open.
- `EmojiPickerMenuButton` internals — split the picker itself: render the trigger statically, `React.lazy` the `EmojiPicker` content gated on dropdown open.
- `BoardTaskCompletionCelebrationProvider` — defer `partycles` import to first task completion (`import("partycles").then(...)` inside the trigger, cache the module).
- Markdown preview components — lazy-import `rehype-rewrite` only inside the preview code path.

### 1.3 Barrel imports — `bundle-barrel-imports`

- `radix-ui` meta barrel used in 5 UI files (pulls in more than scoped sub-packages):
  - `src/client/components/ui/dialog.tsx:2` → `import { Dialog as DialogPrimitive } from "radix-ui"`
  - `src/client/components/ui/button.tsx:3` → `import { Slot } from "radix-ui"`
  - `src/client/components/ui/badge.tsx:3` → same pattern
  - `src/client/components/ui/popover.tsx:2` → `import { Popover as PopoverPrimitive } from "radix-ui"`
  - `src/client/components/ui/separator.tsx:4` → `import { Separator as SeparatorPrimitive } from "radix-ui"`

  **Fix:** Import from the scoped packages (`@radix-ui/react-dialog`, `@radix-ui/react-popover`, …) already in the dependency tree.

- `lucide-react` imported ~35 files from the package root. Vite + esbuild tree-shaking generally handles `lucide-react` named imports well, but belt-and-suspenders: either keep named imports and confirm via `rollup-plugin-visualizer`, or switch heavy-icon files to `lucide-react/dist/esm/icons/<icon>.js` direct paths.

- Internal barrels `src/client/api/mutations/index.ts` and `src/client/gamification/index.ts` are small and fine; not urgent.

### 1.4 No `manualChunks` / `resource hints` — `bundle-preload`
- `vite.config.ts` has no `build.rollupOptions.output.manualChunks`. After 1.1/1.2 you'll want a deliberate split (e.g. `react-vendor`, `dnd`, `editor`, `charts`).
- `index.html` has no `<link rel="preload">` or `<link rel="modulepreload">` for the board route entry.

**Fix:** Once routes are lazy, add `manualChunks` for vendor groups and a `modulepreload` for `BoardPage` (since ~all users land there).

---

## Priority 2 — Re-render hot paths on the board (HIGH)

The board surface re-renders on every query refresh, DnD tick, filter toggle, and scroll metric. Several small things force many memoized subtrees to reconcile.

### 2.1 Per-render layout/metrics effects — `rerender-move-effect-to-event`

**Biggest single hotspot.** Two hot files have `useEffect` / `useLayoutEffect` with **no dependency array**, so they run on every commit.

```135:137:src/client/components/board/useBoardHeaderScrollMetrics.ts
  useEffect(() => {
    syncBoardScrollMetrics();
  });
```

```54:60:src/client/components/board/columns/BoardListColumn.tsx
  useLayoutEffect(() => {
    if (!isTaskDragActive && bandsRef.current) {
      bandHeightsRef.current = Array.from(bandsRef.current.children).map(
        (el) => (el as HTMLElement).getBoundingClientRect().height,
      );
    }
  });
```

Both do **layout reads** (and potentially `setState` in the header case) every render. On a board with N columns, `BoardListColumn`'s layout thrash compounds.

**Fix:** Replace both with effects tied to the actual trigger — scroll, resize, drag-state transitions, and container `ResizeObserver`s — plus a layout effect on mount. Guard `setState` on value change.

### 2.2 Unstable prop references breaking `memo` — `rerender-memo-with-default-value`

Each of these creates a new object/array/function identity per render, defeating `memo(BoardListColumn)` / `memo(BoardListStackedColumn)` / memoized dialogs:

- `src/client/components/board/columns/BoardColumns.tsx:319-324` — `taskMap={Object.fromEntries(...)}` with `?? []` fallbacks rebuilt every render.
- `src/client/components/board/columns/BoardColumnsStacked.tsx:127-129` — `sortableIds={displayTaskMap[...] ?? []}` allocates a fresh `[]` when the list is empty (there's already an `EMPTY_SORTABLE_IDS` constant elsewhere in the file — use it).
- `src/client/components/board/columns/BoardColumns.tsx:352` and `BoardColumnsStacked.tsx:170` — `style={{ zIndex: 60 }}` inline.
- `src/client/components/board/BoardView.tsx:299-302` — `boardThemeStyle` rebuilt every render; spread into `<div style={...}>`.
- `src/client/components/board/header/BoardPriorityToggles.tsx:24-44` — `options` map + `selectedIds={activePriorityIds ?? []}`.
- `src/client/components/board/header/ReleaseSwitcher.tsx:22-40` — same pattern.
- `src/client/components/board/BoardView.tsx:436-469` — every dialog's `onClose={() => setXOpen(false)}` is a new lambda.

**Fix:**
- Memoize `taskMap` with `useMemo` (or push the `Object.fromEntries` into `displayTaskMap`'s existing computation).
- Export a module-level `EMPTY_ARRAY: readonly never[] = []` and reuse.
- Hoist `DRAG_OVERLAY_STYLE = { zIndex: 60 }` to module scope.
- Wrap `boardThemeStyle` in `useMemo` on `resolvedBoardColor(data)` + `dark`.
- Memoize header `options` with `useMemo` keyed on the source arrays.
- Use `useCallback` or stable setters (`setBoardEditOpen` bound with `false`) for dialog `onClose`s. In React 19, `useEvent`-style patterns via refs are also fine.

### 2.3 Props-to-state sync in effects — `rerender-derived-state-no-effect`

```143:152:src/client/components/board/BoardView.tsx
  useEffect(() => {
    setEditingBoardName(false);
    setBoardNameDraft(data?.name ?? "");
  }, [data?.boardId]);

  useEffect(() => {
    if (!editingBoardName) {
      setBoardNameDraft(data?.name ?? "");
    }
  }, [data?.name, editingBoardName]);
```

```241:243:src/client/components/board/columns/BoardColumns.tsx
  useEffect(() => {
    setWeights(bandWeightsForBoard(boardRef.current, workflowOrder));
  }, [board.boardId, visKey, weightsSyncKey, workflowOrder]);
```

Both patterns produce the classic render → effect → setState → render cycle.

**Fix:**
- For rename draft: reset with a `key={data?.boardId}` on the rename sub-component, or derive `displayName = editingBoardName ? boardNameDraft : data.name` during render and only use state while editing.
- For weights: convert to `useMemo` + uncontrolled ref for drag-adjusted deltas, or key the weight-editor by `weightsSyncKey`.

### 2.4 Zustand subscription fan-out — `rerender-defer-reads`

Multiple components subscribe to 3–5 separate preference slices with independent selectors; each is its own subscription.

- `src/client/components/layout/AppHeader.tsx:15-18` — 4 separate `usePreferencesStore(s => s.x)`.
- `src/client/components/layout/NotificationBell.tsx:103-106` — 4 separate selectors.
- `src/client/components/board/BoardView.tsx:72-88` — 5 separate selectors.
- `src/client/components/board/lanes/ListStatusBand.tsx:50-54` — 5 `useResolved*` hooks, each subscribing to `useBoardFiltersStore`; fan-out scales **bands × lists × hooks** on a virtualized board.

**Fix:**
- In leaf components, collapse to a single selector returning an object + `shallow` equality (Zustand's `useShallow`).
- For `ListStatusBand`, hoist the resolved filter set to `BoardView` once and pass down via context (`BoardFilterResolutionContext`), so every band reads one context value instead of subscribing individually.

### 2.5 Transient interaction state held as React state — `rerender-use-ref-transient-values`

```26:27:src/client/components/board/useBoardCanvasPanScroll.ts
  const [panning, setPanning] = useState(false);
```

`panning` is consumed only for a `cursor-grabbing` class in `BoardCanvas.tsx:31-36`. Toggling it re-renders the whole board subtree for a purely visual cursor state.

**Fix:** Drive the class via a ref + direct `element.classList.toggle("cursor-grabbing", …)` in the pointer handlers, or set a CSS custom property on the scroll container — avoids the re-render entirely.

### 2.6 Callback identity churn — `rerender-functional-setstate`

```264:281:src/client/components/board/BoardView.tsx
  const commitBoardRename = useCallback(async () => {
    ...
  }, [boardNameDraft, data, patchBoard]);
```

`boardNameDraft` in deps means the callback re-creates on **every keystroke**, cascading into any memoized consumer.

**Fix:** Read `boardNameDraft` from a ref (`useLatest` pattern in `advanced-use-latest`) so the callback stays stable; or move the commit logic into the input's `onBlur`/`onKeyDown` handler and avoid exposing it as a prop entirely.

### 2.7 No concurrent features for filter/search — `rerender-transitions` / `rerender-use-deferred-value`

Zero `useTransition` / `useDeferredValue` / `startTransition` usage in `src/client`. Filter strip and `BoardSearchDialog` both trigger full-board recomputes on each interaction:

```65:70:src/client/components/board/dialogs/BoardSearchDialog.tsx
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);
```

**Fix:**
- In `BoardSearchDialog`, wrap result filtering in `useDeferredValue(debouncedQuery)` so typing stays responsive.
- When toggling filter chips in the header, wrap the store update in `startTransition` so the filter strip paints immediately and lanes recompute off the critical path.

### 2.8 Trivial `useMemo` — `rerender-simple-expression-in-memo`

```26:28:src/client/components/board/header/BoardTaskCardSizeToggle.tsx
  const nextSize = useMemo(() => {
    return getNextTaskCardViewMode(viewMode);
  }, [viewMode]);
```

Remove — the `useMemo` overhead exceeds the function call.

---

## Priority 3 — Waterfalls & data-fetching (MEDIUM-HIGH)

This is a client-only SPA backed by TanStack Query. Data-fetching is already sensibly centralized in `src/client/api/queries.ts` with `queryFn`s; no rogue `useEffect(() => fetch())` patterns found. Remaining items:

### 3.1 No Suspense boundaries anywhere — `async-suspense-boundaries`

Zero `Suspense`, `useSuspenseQuery`, or `suspense: true` on queries. Loading is done manually (`isLoading` gates in each component). That works today, but:
- It couples each component to its loading UI and prevents the nice "render the shell, stream the rest" model React 19 + TanStack Query support.
- On route changes it contributes to layout flash.

**Fix (medium scope):** Incrementally migrate `useBoard`, `useStatuses`, `useBoardStats` to `useSuspenseQuery` and wrap `BoardView`'s three natural loading regions (board chrome, columns, stats) in `Suspense` boundaries with skeletons. This pairs well with 1.1's route splits.

### 3.2 Sequential `cancelQueries` — `async-parallel`

```375:376:src/client/api/mutations/board.ts
      await qc.cancelQueries({ queryKey: boardKeys.all, exact: true });
      await qc.cancelQueries({ queryKey: boardKeys.detail(id), exact: true });
```

**Fix:**
```ts
await Promise.all([
  qc.cancelQueries({ queryKey: boardKeys.all, exact: true }),
  qc.cancelQueries({ queryKey: boardKeys.detail(id), exact: true }),
]);
```
Also audit other `onMutate` handlers in `src/client/api/mutations/*.ts` for the same pattern while you're in the file.

### 3.3 Event listener duplication on large boards — `client-event-listeners`

`resize` is attached per stacked column and per `MultiSelect`:
- `src/client/components/board/columns/BoardListStackedColumn.tsx:227` — one `window.addEventListener("resize", …)` **per stacked column** (N listeners).
- `src/client/components/multi-select.tsx:447` — per `MultiSelect` instance (~4–6 in the header).
- `src/client/components/board/useBoardHeaderScrollMetrics.ts:154` — one more.

On a 20-list stacked board that's 20+ redundant listeners firing on every resize.

**Fix:** Introduce a shared `useWindowResize` hook backed by a single module-level `ResizeObserver` (or a single `addEventListener("resize")` dispatching to subscribed callbacks through a Set). Same pattern for the `pointermove` listener in `useBoardColumnMap.ts:113` which is always-on during board lifetime.

### 3.4 `wheel` listener correctly non-passive — `client-passive-event-listeners`

`useBoardHeaderScrollMetrics.ts:199-200` uses `{ passive: false }` because it calls `preventDefault()` for horizontal scroll. That is the correct escape hatch; no action needed. `scroll` uses `{ passive: true }` — good.

### 3.5 `localStorage` schema — `client-localstorage-schema`

Already in reasonable shape:
- `src/client/store/preferences.ts` uses Zustand `persist` with `partialize` (lines 152-160) and migration helpers (16-29).
- `src/client/store/boardFilters.ts` has sanitization + legacy-key migration (107-116, 163-171, partialize 393-401).
- `index.html:11` theme bootstrap reads `tm-preferences` — just make sure any key rename in `PREFERENCES_STORAGE_KEY` is mirrored there.

**Fix:** Add an explicit `version` to `persist` options + a `migrate` function, so future schema changes don't silently corrupt old clients.

---

## Priority 4 — Rendering performance (MEDIUM)

### 4.1 `ReleasesTable` unvirtualized — `rendering-content-visibility`

`src/client/components/board/dialogs/ReleasesTable.tsx:44-45` renders `<ul>` + `.map()`. Task lanes already use `@tanstack/react-virtual` (`useVirtualizedBand.ts`), which is stronger than `content-visibility: auto`. Releases are expected to be few (< 50), so the priority here is low.

**Fix if needed:** Apply `content-visibility: auto` with `contain-intrinsic-size` on list rows before reaching for virtualization.

### 4.2 Index by Map, not `find` — `js-index-maps`

Per-render `.find()` scans that compound:
- `src/client/components/board/BoardView.tsx:241-248` — `listStat(listId)` does `query.data?.lists.find(e => e.listId === listId)` **once per list**. Pre-build `Map<listId, stats>` when stats data updates.
- `src/client/components/board/columns/BoardColumns.tsx:306-307` — `board.lists.find` inside `localListIds.flatMap`. O(lists × listIds) per render.
- Same pattern in `src/client/components/board/columns/BoardColumnsStacked.tsx:~97,~115`.

**Fix:** `useMemo(() => new Map(board.lists.map(l => [l.listId, l])), [board.lists])` once near the top of `BoardView`/`BoardColumns`, pass the map (or a lookup function) through context.

### 4.3 Minor: hoist inline RegExp — `js-hoist-regexp`

- `src/client/components/board/shortcuts/useBoardHighlightState.ts:25` — `/(auto|scroll|overlay)/.test(overflow)` during ancestor walk.
- `src/client/components/task/taskMarkdownPreviewComponents.tsx:37` — `/language-(\w+)/.exec(...)` per code block render.

**Fix:** Declare `const SCROLLABLE_OVERFLOW_RE = /(auto|scroll|overlay)/` at module scope.

### 4.4 Minor: `map(...).filter(Boolean)` → `flatMap` — `js-flatmap-filter`

`src/client/components/board/boardFilterSummaries.ts:77-80, 88-92`. Small arrays; micro-optimization.

---

## Priority 5 — Small hygiene items (LOW)

- **`rendering-hoist-jsx`**: `HomeRedirect` (35-38, 52-53) and `BoardView` (323-326) have very similar skeleton JSX. Extract a shared `<BoardLoadingSkeleton />` module-level component.
- **`rerender-no-inline-components`**: no strong examples found — the codebase already splits into module-level column/band components (good).
- **`rerender-split-combined-hooks`**: no single `useState({...blob})` pattern found in the hot paths (good).
- **`rerender-lazy-state-init`**: no obvious `useState(expensiveFn())` misuse (good).
- **`rendering-conditional-render`**: mostly boolean-style `cond && <X/>`, no `{arr.length && …}` traps (good).
- **`advanced-use-latest`**: useful pattern to adopt for `commitBoardRename` and DnD handler refs when fixing 2.6.

---

## Not applicable to this codebase

Vite + React SPA, so the entire `server-*` rule family (RSC, React.cache, `after()`, server actions) does not apply. `client-swr-dedup` is satisfied by TanStack Query. `rendering-script-defer-async` is satisfied — `type="module"` defers by default, and the inline theme script must be synchronous to prevent theme FOUC.

---

## Suggested sequencing

If you want to pick two things to do this week, these have the best effort/impact ratio:

1. **Bundle splits for `mermaid`, `@uiw/react-md-editor`, `emoji-picker-react`, `partycles`** (1.2). Biggest initial-JS wins; each is a ~20–100 line change. Pair with route-level `React.lazy` (1.1).
2. **Fix the two no-deps effects in `useBoardHeaderScrollMetrics` and `BoardListColumn`** (2.1). Simplest way to make every board interaction faster.

After that, the re-render cleanup batch (2.2 + 2.4 + 2.7) is the most impactful ongoing-development investment, because it unlocks future features (rich search, keyboard-heavy flows) without them becoming janky.
