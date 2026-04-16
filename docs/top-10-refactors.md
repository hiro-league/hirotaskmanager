# Top 10 Refactors for the Next Phase

> Reviewed: April 2026 | Scope: full codebase (`src/client`, `src/server`, `src/shared`)
> Follows the no-backward-compatibility / initial-development rule.

Each refactor is ranked by **impact** (how much it improves readability, extensibility, and robustness) weighted against **effort**. The order is most-impactful-first.

---

## 1. Split `routes/boards.ts` into sub-routers (~1,586 LOC → ~5 files)

**Problem.** Every board sub-resource (releases, lists, tasks, describe, stats, view prefs, groups, priorities) lives in a single Hono router. The file has ~1,586 lines, 40+ imports, and touches validation, policy, storage, SSE, and notifications for every domain. Adding a new board feature means scrolling through hundreds of unrelated routes.

**What to do.**

| New file | Routes it owns |
|----------|---------------|
| `routes/boards/index.ts` | `GET /`, `POST /`, board-level CRUD, slug, describe |
| `routes/boards/lists.ts` | `POST /:id/lists`, `PATCH /:id/lists/:lid`, move, reorder, delete |
| `routes/boards/tasks.ts` | `POST /:id/tasks`, `PATCH /:id/tasks/:tid`, move, reorder, delete |
| `routes/boards/releases.ts` | Release CRUD on a board |
| `routes/boards/settings.ts` | View prefs, groups, priorities, CLI policy |

Extract a shared `resolveBoardEntry(c)` middleware or helper that loads the board index entry, runs CLI read-policy, and attaches it to the Hono context—eliminating ~30 repeated blocks of:

```typescript
const entry = entryByIdOrSlug(boardRef);
if (!entry) return c.json({ error: "Board not found" }, 404);
const blockedRead = cliBoardReadError(c, entry);
if (blockedRead) return blockedRead;
```

**Impact.** Reduces cognitive load for every future feature; makes route-level testing straightforward; eliminates the biggest god-file in the codebase.

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

## 10. Slice the preferences store or extract domain hooks

**Problem.** `store/preferences.ts` (~631 LOC) is a single Zustand store with ~25 persisted keys covering: theme, sidebar, card size, board layout, per-board group/priority/release/date filters, notification settings, and more. Every `set*` action and `useResolved*` selector lives in one file. It is the most frequently edited non-component file in the client.

**What to do.**

Option A — **Zustand slices** (preferred if store stays unified):

```
store/
  preferences.ts          — createStore + combine slices + persist
  slices/themeSlice.ts    — theme, systemDark
  slices/boardFiltersSlice.ts — per-board group/priority/release/date filters
  slices/notificationSlice.ts — source filter, panel scope, sounds
  slices/layoutSlice.ts   — sidebar, card size, board layout, stats visibility
```

Option B — **Separate persisted stores** (if slices feel over-engineered):
Split into `store/boardFilters.ts` (the largest and most complex slice) and leave the rest in `preferences.ts`.

Either way, move the `useResolved*` hooks to sit next to their slice so the selector + default-resolution logic is colocated.

**Impact.** Reduces merge conflicts when multiple features touch preferences; makes it obvious where to add new per-board settings; each slice can be tested in isolation.

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
| `notifications/record.ts` (~534 LOC) | Long but mechanical `record*` functions | Split by entity: `recordBoard.ts`, `recordList.ts`, `recordTask.ts` |
| Dialog error handling | Several editor dialogs only handle `onSuccess`, no `onError` toast | Add global `onError` default in mutation factory, or explicit toasts |
| `storage/search.ts` | Duplicate `JOIN`/`WHERE` between `countSearch` and `selectSearchPage` | Extract `buildSearchFromClause(boardId?)` |
| Add-list duplication | `BoardColumns` and `BoardColumnsStacked` duplicate add-list composer state | Extract `useAddListComposer(boardId)` |
| `boardShortcutRegistry.ts` exports store-coupled helpers | `cycleTaskGroupForBoard` etc. call `usePreferencesStore.getState()` | Move helpers to `boardShortcutActions.ts` or colocate with preferences |

---

## Suggested execution order

Given AI-agent speed, these can realistically be done in 2–3 sessions:

1. **Refactors 3, 4, 9** — Small, self-contained, no UI changes. Good warm-up.
2. **Refactors 1, 8** — Server-side file splits. Run `bun test` after each.
3. **Refactors 2, 5, 6** — Client component splits. Visual regression check via dev server.
4. **Refactors 7, 10** — Hook and store restructuring. Verify DnD and filter behavior.

Each refactor is independent—they can be done in any order without conflicts.
