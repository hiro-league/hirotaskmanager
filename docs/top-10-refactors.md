# Top 10 Refactors for the Next Phase

> Reviewed: April 2026 | Scope: full codebase (`src/client`, `src/server`, `src/shared`)
> Follows the no-backward-compatibility / initial-development rule.

Each refactor is ranked by **impact** (how much it improves readability, extensibility, and robustness) weighted against **effort**. The order is most-impactful-first.

> **Performance safeguard notice.** Several refactors touch files that carry
> board-performance optimizations documented in `docs/board-performance-plan.md`
> and `docs/performance-fixes.md`. Each item below includes a
> **⚠ Perf safeguards** section when relevant so implementors know which
> invariants must survive the split.

---

## 1. ~~Split `routes/boards.ts` into sub-routers~~ ✅ Done

Completed. The monolithic `routes/boards.ts` has been split into:

| File | Routes |
|------|--------|
| `routes/boards/index.ts` | `GET /`, `POST /`, board-level CRUD, describe, stats |
| `routes/boards/lists.ts` | List CRUD, move, reorder |
| `routes/boards/tasks.ts` | Task CRUD, move, reorder |
| `routes/boards/releases.ts` | Release CRUD |
| `routes/boards/settings.ts` | View prefs, groups, priorities |
| `routes/boards/shared.ts` | `resolveBoardEntry` middleware, mutation-response helpers, `parseBoardFetchBodyPreview` |

A `resolveBoardEntry` Hono middleware resolves the board index entry, runs CLI read-policy, and attaches it to the Hono context via `c.set("boardEntry", entry)`. All sub-routers use `requireBoardEntry(c)` to read it.

> **Note for docs maintainers:** `docs/performance-fixes.md` (Fix #7) and
> `docs/board-performance-plan.md` (Phase 2 item 7) still reference the old
> `src/server/routes/boards.ts` path. The slim-fetch logic (`parseBoardFetchBodyPreview`,
> `loadBoardAfterGranularWrite`, granular mutation response header gate) now lives
> in `routes/boards/shared.ts` and `routes/boards/index.ts`.

---

## 2. Decompose `BoardView.tsx` (~1,537 LOC → ~5 modules)

**Problem.** `BoardView.tsx` is the single largest React component. It manages board data loading, SSE, header UI (rename, emoji, filters, stats, scroll tracking), canvas scroll/wheel/pan, all dialog toggles, and a ~320-line inner `BoardShortcutBindings` component with debounced imperative cache updates for group/priority/card-size cycling.

**What to do.**

| Extracted module | Responsibility |
|------------------|---------------|
| `BoardHeader.tsx` | Title row: rename, emoji, chips, filter controls, collapse, stats |
| `BoardShortcutBindings.tsx` | The `BoardShortcutBindings` inner component (~320 LOC) that wires keyboard shortcuts to debounced task mutations; becomes independently testable |
| `useBoardHeaderScrollMetrics.ts` | Scroll-tracking effect + CSS variable sync for header shadow/fade |
| `boardFilterSummaries.ts` | Pure functions that compute active-filter label strings from board + preferences (currently inline in render) |
| `BoardCanvas.tsx` _(optional)_ | The scroll/pan surface wrapper that composes `useBoardCanvasPanScroll` + wheel handler |

`BoardView.tsx` becomes an orchestrator: loads data, provides contexts, and composes `BoardHeader` + `BoardCanvas` + column layout.

**Impact.** The most-visited file during feature development becomes navigable; shortcuts logic becomes unit-testable without rendering the full board.

**⚠ Perf safeguards.**

- `BoardView` composes five nested providers (`ShortcutScopeProvider` → `BoardStatsDisplayProvider` → `BoardTaskKeyboardBridgeProvider` → `BoardKeyboardNavProvider` → `BoardTaskCompletionCelebrationProvider`). Perf plan Phase 3 item 11 aims to flatten this cascade. Extracted modules (`BoardHeader`, `BoardShortcutBindings`) must **not** introduce additional context providers that deepen the nesting or add new render triggers around the column tree.
- `BoardShortcutBindings` currently reads `board` via closure (not a prop). If extracted to its own file, pass only the minimum slice it needs (e.g. `boardId`, `taskGroups`, `taskPriorities`) so it doesn't defeat `React.memo` boundaries established by perf fix #2. Do **not** pass a full `Board` object as a prop.
- `BoardView` passes `board` to `BoardColumns`/`BoardColumnsStacked`, which internally spread it via `boardColumnSpreadProps(board)`. The extracted `BoardCanvas` (if created) must preserve this — never pass `board` deeper than the column-layout component.

---

## 3. Unify SSE infrastructure (`events.ts` + `notificationEvents.ts`)

**Problem.** Two files implement nearly identical SSE stream machinery: `TextEncoder`, keepalive interval, subscriber set, `ReadableStream` construction with abort/cleanup, and identical HTTP headers. `notificationEvents.ts` then bridges into `events.ts` via `publishNotificationToAllSubscribers`. This is ~225 lines of duplicated plumbing.

**What to do.**

Create `src/server/lib/sseHub.ts`:

```typescript
export function createSseHub<S extends { send(chunk: Uint8Array): void; close(): void }>() {
  const subscribers = new Set<S>();
  const encoder = new TextEncoder();

  function broadcast(chunk: Uint8Array, filter?: (s: S) => boolean) { ... }
  function encodeSseEvent(kind: string, data: unknown): Uint8Array { ... }
  function createSseResponse(makeSubscriber: (send, close) => S, signal?: AbortSignal): Response { ... }

  return { subscribers, broadcast, encodeSseEvent, createSseResponse };
}
```

Then `events.ts` and `notificationEvents.ts` each become thin files that configure their own hub shape (board subscriber has `boardId`; notification subscriber does not) and export their domain-specific `publish*` / `create*Response` functions.

**Impact.** Eliminates the most obvious copy-paste in the server; makes it trivial to add future SSE channels (e.g., per-user events, CLI progress streams).

**⚠ Perf safeguards.**

- `notificationEvents.ts` bridges into `events.ts` via `publishNotificationToAllSubscribers` so board-scoped SSE subscribers also receive notification events. The unified `sseHub` must preserve this cross-channel bridge — do not isolate the two hubs so completely that the board stream stops receiving notification pushes.
- Board SSE subscribers carry a `boardId` field used for per-board filtering in `publishBoardEvent` / `publishBoardChanged`. The hub's `broadcast` filter callback must support this per-subscriber field discrimination. A generic `filter?: (s: S) => boolean` parameter (as shown) is sufficient.
- Granular SSE events (`task-created`, `task-updated`, `list-created`, `release-upserted`, etc.) were added in the performance work to support reduced-refetch on the client (`useBoardChangeStream`). Verify that the `encodeSseEvent` output format (`event: <kind>\ndata: <json>\n\n`) does not change, as the client parses it by event type.

---

## 4. Move raw SQL out of `routes/trash.ts` into storage

**Problem.** `trash.ts` routes directly call `getDb().query(...)` to look up `board_id` for trashed lists and tasks—4 raw SQL queries embedded in route handlers. Every other route delegates to `src/server/storage/`. This breaks the storage abstraction layer and duplicates the "find board for trashed entity" pattern.

**What to do.**

Add to `storage/lists.ts` and `storage/tasks.ts`:

```typescript
export function findBoardIdForTrashedList(listId: number): number | null { ... }
export function findBoardIdForTrashedTask(taskId: number): number | null { ... }
```

Update the 4 trash route handlers (list restore, list purge, task restore, task purge) to call these instead.

**Impact.** Small change, high signal—restores the layering contract that every other route follows; makes storage queries testable and indexable in one place.

---

## 5. Extract `BoardKeyboardNavContext.tsx` internals (~841 LOC)

**Problem.** This context provider manages highlight state, DOM element registry, scroll-into-view, column-task ordering, notification reveal targets, and pointer column resolution. At ~841 lines it is the second-largest React file after `BoardView.tsx` and the hardest to reason about when debugging keyboard navigation.

**What to do.**

| Extracted hook | Responsibility |
|---------------|---------------|
| `useBoardColumnMap.ts` | Column → ordered task ID mapping, pointer-based column resolution |
| `useBoardHighlightState.ts` | Current highlight position, move/clear logic, ring rendering |
| `useTaskRevealRegistry.ts` | `registerRevealTask` / `revealTask` for virtualized scroll-to |

The `BoardKeyboardNavProvider` composes these three hooks and exposes the same context API. Consumers don't change.

**Impact.** Keyboard navigation bugs become isolatable to the specific hook that owns the state; new keyboard features (e.g., multi-select) can be added without touching the others.

**⚠ Perf safeguards — critical.**

- **Ref-backed highlight & hover (perf fixes #1, #1b).** `highlightedTaskId`, `highlightedListId`, `hoveredTaskId`, and `hoveredListId` are stored in `useRef`, **not** `useState`. The setters only mutate refs and update DOM ring classes imperatively via `classList.add`/`remove` + `style.setProperty`. Extracted hooks (`useBoardHighlightState`, `useBoardColumnMap`) must **never** promote these values back to React state — doing so would re-introduce the full-board re-render on every hover/arrow-key move that perf fix #1 eliminated (measured: 20 commits × 536–637 ms each before fix).
- **Imperative ring rendering.** `setKeyboardRing` applies `KEYBOARD_RING_CLASSES` and `--tw-ring-color` directly on registered DOM elements. `syncTaskHighlightVisual` / `syncListHighlightVisual` remove the ring from the previous element and apply it to the new one — all without a React render. The extracted `useBoardHighlightState` must own both the ref and the DOM manipulation; it must not emit a context value change that consumers read during render.
- **Virtualized task reveal (perf fix #4).** `taskRevealersRef` maps task IDs to reveal callbacks registered by virtualized bands. When keyboard navigation targets an offscreen task, the revealer scrolls the virtualizer to bring it into view before the nav layer expects `registerTaskElement()` to exist. The extracted `useTaskRevealRegistry` must keep the same `registerTaskRevealer` / reveal-before-highlight contract, and must not introduce a React render to trigger the reveal.
- **`buildTasksByListStatusIndex` (perf fix #3).** `BoardKeyboardNavProvider` builds its own `tasksByListStatus` index memoized on `board.tasks`. The extracted `useBoardColumnMap` should accept this index as a parameter (or build its own from the same `board.tasks` ref), not re-scan the full tasks array per band.

---

## 6. Split `BoardListStackedColumn.tsx` (~1,023 LOC) and `ListStatusBand.tsx` (~788 LOC)

**Problem.** These two files are the render workhorses for the stacked and lanes board layouts respectively. Each mixes task CRUD, quick-add composer, keyboard bridge, DnD shell, and virtualization into one component. `BoardListStackedColumn` also embeds inline title editing and the full `TaskEditor`.

**What to do.**

For `BoardListStackedColumn.tsx`:

| Module | Content |
|--------|---------|
| `StackedListHeader.tsx` | Title, emoji, inline rename, collapse |
| `StackedTaskList.tsx` | Virtual + non-virtual sortable task list |
| `useStackedListTaskActions.ts` | Quick-add, complete, delete, navigation callbacks |

For `ListStatusBand.tsx`:

| Module | Content |
|--------|---------|
| `BandTaskList.tsx` | The sortable/virtual task card loop |
| `BandComposer.tsx` | FAB + quick-add inline composer |
| `useBandController.ts` | CRUD callbacks, keyboard bridge wiring, celebration |

**Impact.** Each layout's rendering pipeline becomes understandable in isolation; performance profiling can target specific sub-components rather than one monolith.

**⚠ Perf safeguards — critical.**

- **`React.memo` boundaries (perf fix #2).** Both `BoardListStackedColumn` and `ListStatusBand` are wrapped in `React.memo` and receive sliced props via `BoardColumnSpreadProps` / `BoardBandSpreadProps` — never a full `Board` object. Extracted sub-components (`StackedTaskList`, `BandTaskList`, etc.) must either:
  - (a) Be wrapped in `React.memo` themselves and receive only the subset of sliced props they need, or
  - (b) Be non-memoized children that receive no props whose identity changes on unrelated board updates (i.e. they only read from the parent's already-stable slices).
  Do **not** re-introduce a `board` prop at any level of the extracted tree.
- **Virtualization (perf fix #4).** Both components use `useVirtualizedBand` (which wraps `@tanstack/react-virtual`) for task-row windowing. The extracted `StackedTaskList` / `BandTaskList` must own the virtualizer instance and the scroll viewport div — the virtualizer measures its container's scroll position, so the DOM nesting between the scroll container and the virtual items must not change. Verify that `estimateSize`, `overscan`, and the `data-task-card-root` attribute survive the extraction.
- **Horizontal column gating (perf fix #4 addendum).** `BoardListStackedColumn` uses `useColumnInViewport` (IntersectionObserver-based) to gate whether `ListStackedBody` mounts at all. The column shell div (`w-72 shrink-0`) must stay mounted even when the body is gated — it preserves scroll width and column-reorder DnD. If the body is extracted to `StackedTaskList.tsx`, the gate logic must remain in the parent column component, not move into the child.
- **Progressive column mounting (perf fix #9B).** `BoardColumnsStacked` renders only the first 8 columns immediately and fills the rest via `requestIdleCallback`. Extracted sub-components are unaffected as long as the column-shell / placeholder boundary stays in `BoardColumnsStacked`.
- **Lazy emoji dropdown (perf fix #6).** `ListHeader` passes `lazyMountDropdown` to `EmojiPickerMenuButton`. If `StackedListHeader.tsx` is extracted, it must preserve this prop so the emoji Radix portal is not eagerly mounted for every list on load.

---

## 7. Deduplicate lanes vs. stacked DnD hooks

**Problem.** `useLanesBoardDnd.ts` (~206 LOC) and `useStackedBoardDnd.ts` (~160 LOC) share near-identical code for: building `containerMapDeps` strings, applying board filters to build `tasksByListStatus`, computing the `serverTaskMap` memo, and returning the same shape to `useBoardTaskDndReact`. The meaningful difference is only in the persist functions (lanes persists with status context; stacked persists cross-list with same-status filtering).

**What to do.**

Create `useBoardDndContainerContext.ts`:

```typescript
export function useBoardDndContainerContext(
  board: Board,
  listIds: number[],
  buildContainerMap: (tasks: TasksByListStatus) => Map<string, number[]>,
) {
  // shared: taskFilter, tasksByListStatus, containerMapDeps hash, serverTaskMap
  return { serverTaskMap, containerMapDeps, taskFilter, tasksByListStatus };
}
```

Then `useLanesBoardDnd` and `useStackedBoardDnd` become thin wrappers: they call `useBoardDndContainerContext` with their specific `buildContainerMap`, and add their layout-specific `persistChanges`.

**Impact.** Bug fixes to filter/hash logic apply once; adding a third layout mode (e.g., Kanban by priority) reuses the same base hook.

**⚠ Perf safeguards.**

- **FNV-1a hash (perf fix #8).** Both hooks now use `hashTasksForDndLayoutDeps(tasks)` (from `boardTaskDndDeps.ts`) instead of the old per-task string concatenation + `join("|")`. The shared `useBoardDndContainerContext` must use this hash for `containerMapDeps` — do not revert to string-based signatures.
- **Structural map equality (perf fix #8).** `useBoardTaskDndReact` uses `taskContainerMapsEqual(a, b)` for no-op drag detection and pending-map reconciliation. The shared hook must pass through or compose this comparison — do not re-introduce `serializeTaskContainerMap` (deleted in perf fix #8).
- **Pre-indexed `tasksByListStatus` (perf fix #3).** Both hooks build the index via `buildTasksByListStatusIndex(board.tasks)` and return it so column children get O(1) per-band lookups. The shared hook must continue to build and return this index — it is the enabler for `React.memo` on bands (perf fix #2).

---

## 8. Split `storage/board.ts` (~1,181 LOC) by concern

**Problem.** `storage/board.ts` is the server's largest storage module. It handles: status listing, board index reads, slug generation, full board loads (with/without tasks), patching board metadata, trash/restore/purge, describe payload assembly, view preferences, and task group/priority configuration. Many of these are independent domains that happen to share a `board_id`.

**What to do.**

| New file | Functions moved |
|----------|----------------|
| `storage/board.ts` | `readBoardIndex`, `boardIndexEntryById`, `entryByIdOrSlug`, `generateSlug`, `createBoardWithDefaults`, basic board PATCH, `loadBoard`, `loadBoardWithoutTasks` |
| `storage/boardTrash.ts` | `trashBoardById`, `restoreBoardById`, `purgeBoardById` |
| `storage/boardDescribe.ts` | `loadBoardDescribe` (combines board + entities into describe response) |
| `storage/boardViewPrefs.ts` | `patchBoardViewPrefs`, `patchBoardTaskPriorities`, `patchBoardTaskGroupConfig` |
| `storage/statuses.ts` | `listStatuses`, `ensureDataDir` |

Keep `storage/index.ts` as the public barrel—external imports don't change.

**Impact.** Finding where a storage bug lives becomes O(1) instead of O(scroll); new board sub-features get their own focused file.

**⚠ Perf safeguards.**

- **Slim `loadBoard` (perf fix #7).** `loadBoard(boardId, options?)` accepts an optional `{ taskBodyMaxChars }` that triggers a `SUBSTR(t.body, 1, n)` branch in the task SELECT. This option and the `LoadBoardOptions` type must stay in whichever file owns `loadBoard` (proposed: the core `storage/board.ts`). The route-level `parseBoardFetchBodyPreview` in `routes/boards/shared.ts` depends on it.
- **`loadBoardWithoutTasks` (describe path).** If `loadBoardDescribe` moves to `storage/boardDescribe.ts`, it should import `loadBoardWithoutTasks` from the core module — do not duplicate the board-row query.

---

## 9. Consolidate shared string/validation utilities

**Problem.** Several small utilities are duplicated or scattered:

- **Hex color regex**: `HEX_COLOR_RE` is defined independently in both `TaskPrioritiesEditorDialog.tsx` and `ReleasesEditorDialog.tsx`.
- **Grapheme counting**: `taskTitle.ts` and `emojiField.ts` both implement `Intl.Segmenter`-based grapheme logic with different APIs.
- **Principal normalization**: `normalizeCreatorPrincipal` appears in `storage/board.ts`, `storage/tasks.ts`, and `storage/notifications.ts` with identical logic.
- **Debug logging**: `useHorizontalListReorderReact.ts` has `console.debug` calls that ship to production.

**What to do.**

| Target | Action |
|--------|--------|
| `shared/hexColor.ts` | Single `HEX_COLOR_RE`, `isValidHexColor()`, shared by both editor dialogs |
| `shared/grapheme.ts` | Merge `taskTitle.ts` grapheme helpers with `emojiField.ts` segmenter into one module; re-export from both |
| `shared/principal.ts` | One `normalizePrincipal(raw): CreatorPrincipalType \| undefined` used by all three storage files |
| Remove debug logs | Strip `console.debug` from `useHorizontalListReorderReact.ts` or gate behind `import.meta.env.DEV` |

**Impact.** Low effort, high hygiene; prevents divergence in validation rules that would cause subtle bugs (e.g., one dialog accepting `#fff` and another rejecting it).

---

## 10. ~~Slice the preferences store or extract domain hooks~~ ✅ Done

Completed using the lighter **separate persisted stores** path:

- `store/boardFilters.ts` now owns the board-scoped persisted state: group, priority, release, date, and task-card view preferences.
- `store/preferences.ts` now focuses on global UI preferences: theme, sidebar, notification settings, filter-strip collapse, and shortcut-help dismissal.
- The `useResolved*` hooks and task-card view helpers were moved next to the board-filters store, while `preferences.ts` re-exports them so existing imports stay stable where possible.
- Direct board-filter mutations/readers (`BoardTaskDateFilter`, switchers, shortcut bindings, sidebar prune, shortcut registry) now use `useBoardFiltersStore`.

**Impact.** Reduces merge conflicts in the most frequently edited client store, makes new board-local settings easier to place, and keeps selector/default-resolution logic colocated with the board preference state.

---

## Honorable mentions (just outside the top 10)

These are worth doing but didn't make the cut because they're either lower leverage or more incremental:

| Area | Issue | Quick fix |
|------|-------|-----------|
| `TaskEditor.tsx` (~913 LOC) | Mixes markdown field, form state, dirty tracking, and modal shell | Extract `useTaskEditorForm.ts` + `TaskMarkdownField.tsx` |
| `Sidebar.tsx` (~652 LOC) | Board list, inline rename, delete confirm in one file | Extract `SidebarBoardItem.tsx` + `useSidebarBoardMutations.ts` |
| `ReleasesEditorDialog.tsx` (~852 LOC) | Full CRUD + color picker + delete confirm | Split table body into `ReleasesTable.tsx` |
| `BoardSearchDialog.tsx` | Manual `fetch` + `useState` instead of `useQuery` | Migrate to `useQuery({ enabled: !!debouncedQuery })` for caching/retry |
| `cliPolicyGuard.ts` | ~10 near-identical `cli*Error` functions | Table-driven: `cliPolicyError(c, boardId, field, label)` |
| `src/server/notifications/record.ts` (~533 LOC) | Many `record*` entry points (`commit`, payload helpers, board/list/task variants) in one file; safe to split because boundaries are already named | Split by entity: e.g. `recordBoard.ts`, `recordList.ts`, `recordTask.ts`, shared `commit` + payload utilities in a small `recordShared.ts` if needed |
| Dialog error handling | Several editor dialogs wire mutations with `onSuccess` only; failures are silent or console-only | Default `onError` in the shared mutation helper / query client, or explicit `toast.error` + logging per dialog; align with `general-coding-rules` (log + user-visible feedback) |
| `storage/search.ts` | Duplicate `JOIN`/`WHERE` between `countSearch` and `selectSearchPage` | Extract `buildSearchFromClause(boardId?)` |
| Add-list duplication | `BoardColumns` and `BoardColumnsStacked` duplicate add-list composer state | Extract `useAddListComposer(boardId)` |

---

## Suggested execution order

Given AI-agent speed, these can realistically be done in 2–3 sessions:

1. **Refactors 3, 4, 9** — Small, self-contained, no UI changes. Good warm-up.
2. ~~**Refactors 1, 8**~~ → **Refactor 8** — Refactor 1 is done. Run `bun test` after #8.
3. **Refactors 2, 5, 6** — Client component splits. Visual regression check via dev server. **Read the ⚠ Perf safeguards carefully** — these three touch the most performance-critical client code.
4. **Refactors 7, 10** — Hook and store restructuring. Verify DnD and filter behavior.

Each refactor is independent—they can be done in any order without conflicts. However, refactors 5 and 6 share performance invariants with refactor 2 (all touch the board column/provider tree), so doing them in the same session reduces the risk of one undoing another's perf contract.
