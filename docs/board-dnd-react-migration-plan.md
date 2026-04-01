# Board DnD React Migration Plan

This document lays out the implementation plan for migrating the board drag-and-drop layer from the current `@dnd-kit/core` + `@dnd-kit/sortable` implementation to the newer React-focused `@dnd-kit` APIs described in the multiple sortable lists guide.

The migration is already decided. The purpose of this document is to sequence the work, reduce risk, and define the phases needed to get from the current board DnD architecture to the new one without losing core behavior.

## Summary

Working assumptions:

- The migration will happen.
- The old implementation is not stable enough to keep investing in.
- The official React-first multiple-sortable-lists approach is expected to replace a meaningful amount of the current custom collision and movement plumbing.
- This is still a **medium-to-large refactor**, not a dependency bump.

Main implementation goal:

- replace the current board DnD shell with the newer React-first approach while preserving:
  - list drag
  - task drag across multiple containers
  - empty-container drops
  - overlay behavior
  - cancellation behavior
  - server persistence
  - stacked and lanes layouts

Main delivery strategy:

- do the migration in **phases**
- migrate the **simpler paths first**
- keep the board working after each phase
- defer cleanup until the new architecture is stable

## Migration goals

- Remove as much custom collision and cross-container glue as the new API makes possible.
- Replace the current board-wide `DndContext` plumbing with the newer provider/event model.
- Follow the official multiple sortable lists pattern as closely as the board allows:
  - `DragDropProvider`
  - grouped sortable items across containers
  - droppable containers for empty targets
  - `onDragOver` moves for items
  - `onDragEnd` reorder for columns
- Keep behavior parity where it matters:
  - list reorder
  - task reorder within one container
  - task moves across containers
  - drag cancel
  - empty-target drop
- Reduce the amount of board-specific DnD code that future changes need to reason about.
- End with one documented, maintainable DnD architecture that both board layouts share.

## Confirmed product/engineering decisions

- This is a migration plan, not a feasibility document.
- The target implementation is the official dndkit React multiple sortable lists approach, even though it does not match the current plugin stack.
- The discovery work exists to reduce rewrite mistakes, not to decide whether to migrate.
- `stacked` remains the first task-layout target after the shared foundations are in place.
- `lanes` migrates after stacked is stable.
- Keyboard list-drag parity is explicitly allowed to land later as follow-up work.
- A runtime dual-path or fallback implementation is not required.
- The old DnD path can be deleted as each migrated phase becomes stable.

## Non-goals

- Do not redesign board UX as part of the migration.
- Do not change board data shape or server mutation contracts unless required.
- Do not combine this work with unrelated board cleanup, theming, or keyboard-nav refactors.
- Do not try to improve all known drag performance issues at the same time unless they are directly caused by the migration.

## Current codebase fit

The existing board DnD system is split across several layers:

| File | Current role |
|------|--------------|
| `src/client/components/board/useTaskDndCore.ts` | Shared task DnD state machine, collision detection, optimistic container map, persistence |
| `src/client/components/board/useHorizontalListReorder.ts` | List column drag, sensors, local order, reorder mutation |
| `src/client/components/board/useLanesBoardDnd.ts` | Lanes layout composition and persistence rules |
| `src/client/components/board/useStackedBoardDnd.ts` | Stacked layout composition and persistence rules |
| `src/client/components/board/BoardColumns.tsx` | Lanes `DndContext`, `DragOverlay`, list `SortableContext` |
| `src/client/components/board/BoardColumnsStacked.tsx` | Stacked `DndContext`, `DragOverlay`, list `SortableContext` |
| `src/client/components/board/ListStatusBand.tsx` | Droppable lane bands and task sortable context |
| `src/client/components/board/BoardListStackedColumn.tsx` | Stacked droppable container and task sortable context |
| `src/client/components/board/SortableTaskRow.tsx` | Sortable task row |
| `src/client/components/board/BoardListColumn.tsx` | Sortable list column in lanes |
| `src/client/components/board/dndIds.ts` | Shared sortable and container IDs |

Important current characteristics:

- The board supports **two drag kinds** in the same tree:
  - list drag
  - task drag
- Task drag uses a shared **container map**:
  - `Record<string, string[]>`
- Cross-container moves are driven by **custom `onDragOver` state updates**.
- Task collision logic is customized to avoid unstable `over` targets.
- Persistence is **layout-specific**:
  - stacked: move between lists, then reorder per status band
  - lanes: move between `(list, status)` bands, then reorder bands
- UI rendering relies on a layered source of truth:
  - server map
  - live drag map
  - pending optimistic map

This means a migration must preserve behavior at multiple levels, not just replace provider and hooks.

## What would likely change

Even if the overall behavior stays the same, these areas would likely need to be rewritten or heavily adapted:

### 1. Root provider and event model

Current code assumes:

- `DndContext`
- `DragStartEvent`
- `DragOverEvent`
- `DragEndEvent`
- `active` / `over`

A migration would likely require:

- `DragDropProvider`
- new event shapes
- updated drag source / target extraction
- updated cancellation handling

### 2. Sortable and droppable hook APIs

Current components use:

- `useSortable`
- `useDroppable`
- `setNodeRef`
- `attributes`
- `listeners`
- `transform`
- `transition`

The newer APIs may expose similar concepts with different shapes, naming, or helper layers. Every draggable and droppable callsite would need review.

### 3. Collision and targeting logic

`useTaskDndCore.ts` currently includes custom task-specific collision filtering and fallback logic. That code would need one of three outcomes:

1. port directly to the new provider API
2. simplify because the new system already behaves well enough
3. replace with a new equivalent mechanism

This is one of the highest-risk parts of the migration.

### 4. Shared task state machine

The current state machine includes:

- `taskContainers`
- `pendingTaskMap`
- `activeTaskId`
- `taskDragStartMapRef`
- `reverseIdxRef`
- `activeKindRef`

Even if the new library provides stronger sortable defaults, the board will probably still need some version of this state because:

- tasks move between containers
- persistence is server-backed
- filtered views must merge back into full server order
- list and task drags coexist

The migration goal is still to delete as much of the current hand-rolled movement and collision plumbing as the official approach makes unnecessary.

### 5. Overlay and board integration

The board currently depends on:

- `DragOverlay`
- task hover and keyboard-nav integration in surrounding board code

These need dedicated validation after any migration.

## Migration strategy

The safest path is a phased plan.

## Phase 0: foundation and discovery

Goal:

- lock the target API shape and remove unknowns before broad code edits begin

Scope:

- confirm the exact package set and API imports needed to follow the official guide
- map current concepts to target concepts
- build enough understanding to start the real migration phases safely

Why this phase exists:

- the current implementation mixes several concerns:
  - provider wiring
  - list drag
  - task drag
  - collision customization
  - optimistic render state
  - persistence
- starting broad edits without a target mapping will create churn and rework

Tasks:

1. Confirm the exact package set and API imports used by the official multiple sortable lists approach.
2. Write a compatibility table for:
   - provider and event shapes
   - draggable and droppable hooks
   - sortable item and container wiring
   - overlay behavior
   - cancellation semantics
3. Identify which current custom behaviors can be dropped entirely because the official React-first approach already covers them.
4. Identify which behaviors still need project-specific logic:
   - persistence ordering
   - filtered reorder merge
   - list-vs-task drag routing
5. Decide whether a minimal helper layer is still useful, while avoiding a long-lived compatibility abstraction.

Deliverables:

- a target API notes section in this doc or a linked note
- a current-to-target concept mapping
- a list of behaviors that must remain custom

### Phase 0 findings

These findings lock the first-pass migration target and identify what should be deleted versus preserved.

#### Target package and import shape

Phase 0 target:

- `@dnd-kit/react`
  - `DragDropProvider`
  - `useDroppable`
- `@dnd-kit/react/sortable`
  - `useSortable`
- `@dnd-kit/helpers`
  - `move`
- `@dnd-kit/abstract`
  - `CollisionPriority` when we need container-vs-item collision priority like the official guide

Current packages expected to be removed from board DnD code over the migration:

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`

Notes:

- This plan follows the official multiple sortable lists guide:
  - [Multiple sortable lists](https://dndkit.com/react/guides/multiple-sortable-lists)
- The new quickstart confirms the React-first provider and hook model:
  - [Quickstart](https://docs.dndkit.com/react/quickstart)
- The event model changes from `active` / `over` on `DndContext` events to `event.operation.source` / `event.operation.target` on `DragDropProvider`.

#### Current-to-target mapping

| Current piece | Current responsibility | Target shape in new approach | Phase 1+ note |
|---|---|---|---|
| `BoardColumns.tsx` | Lanes root `DndContext`, overlay, list `SortableContext` | `DragDropProvider` root for lanes | Keep overlay content, replace provider/events |
| `BoardColumnsStacked.tsx` | Stacked root `DndContext`, overlay, list `SortableContext` | `DragDropProvider` root for stacked | Same root conversion as lanes |
| `useHorizontalListReorder.ts` | sensors, local list order, list drag callbacks, reorder mutation | local list order + provider event handlers using `move(columns, event)` for column reorder | Keep persistence and server-sync behavior; drop `KeyboardSensor`, `PointerSensor`, `listCollision` |
| `useTaskDndCore.ts` | shared task DnD state machine, custom collision, custom drag-over movement | shared task container state driven by `DragDropProvider` item operations and `move(items, event)` | Main simplification target |
| `useStackedBoardDnd.ts` | stacked container map + stacked persistence | keep as stacked-specific build/persist layer | Mostly keep persistence, simplify movement plumbing |
| `useLanesBoardDnd.ts` | lanes container map + lanes persistence | keep as lanes-specific build/persist layer | Mostly keep persistence, simplify movement plumbing |
| `BoardListColumn.tsx` | sortable lane column, list header drag handle | column `useSortable({ type: "column", ... })` in new sortable API | Still owns visual list shell |
| `BoardListStackedColumn.tsx` | sortable stacked column + task droppable area | column sortable + stacked task droppable container in new API | Split column-sortable vs task-container responsibilities more clearly |
| `ListStatusBand.tsx` | lane band droppable container + task sortable rows | `useDroppable` band + task `useSortable` rows grouped by band | No `SortableContext`; band becomes explicit droppable container |
| `SortableTaskRow.tsx` | sortable task row with transform/listeners | task `useSortable({ type: "item", group: containerId, accept: "item" })` | Must receive container-aware metadata |
| `dndIds.ts` | list/task/container ids | keep | IDs remain migration-safe and should not be redesigned unless forced |
| `BoardDragOverlayContent.tsx` | drag clone rendering for task or list | keep overlay content component if compatible | Verify exact new overlay API during Phase 1 |

#### Custom logic that should be deleted

These are the highest-confidence deletion targets because the official grouped-sortable + droppable-container approach is intended to cover them:

- `collisionDetection` in `useTaskDndCore.ts`
- `listCollision` in `useHorizontalListReorder.ts`
- task-specific collision filtering of list droppables
- `lastResolvedTaskCollisionIdRef`
- `reverseIdxRef`
- `buildReverseIndex()`
- `findTaskContainer()`
- midpoint-based same-container reorder guards
- midpoint-based cross-container ping-pong guards
- most of `activeKindRef`-based routing if source `type` cleanly separates column vs item operations
- `SortableContext` usage in board task/list containers if the new sortable API no longer requires it

#### Custom logic that should remain project-specific

These behaviors are tied to TaskManager rather than to the DnD library:

- `buildContainerMap()` in `useStackedBoardDnd.ts` and `useLanesBoardDnd.ts`
- `persistStackedChanges()`
- `persistLanesChanges()`
- `mergeFilteredOrderIntoFullBand()`
- server-sync and mutation sequencing after drop
- `pendingTaskMap` or an equivalent optimistic bridge while the server catches up
- board-specific overlay rendering in `BoardDragOverlayContent.tsx`
- list/task id encoding in `dndIds.ts`
- grouped task filtering by active group
- lanes-specific `(list, status)` band semantics

#### Phase 1 entry checklist

Before code changes begin in Phase 1, we should treat the following as locked:

- target provider: `DragDropProvider`
- target movement helper: `move`
- target task model: grouped sortable items across container ids
- target empty-drop model: explicit `useDroppable` containers with lower collision priority than items
- target list model: sortable columns reordered on drag end
- no requirement to preserve old implementation details such as custom collision tuning or keyboard sensor wiring

## Phase 1: migrate shared primitives

Goal:

- introduce the new dependency and shared low-level wrappers without changing the whole board at once

Tasks:

1. Update the dependency set to the React-first DnD packages used by the official guide.
2. Add only minimal helper code where it clearly reduces churn:
   - event normalization
   - source / target ID extraction
   - shared sortable item props
   - shared droppable container props
3. Migrate the smallest reusable building blocks first:
   - `SortableTaskRow`
   - list-column sortable wrappers
   - droppable container wrappers
4. Preserve existing IDs in `dndIds.ts` unless the new API forces a different shape.

Suggested adapter targets:

- drag event normalization
- source / target ID extraction
- common sortable item props
- common droppable container props

The more churn hidden behind a small adapter or utility layer, the less invasive later phases become.

Acceptance criteria:

- project builds with the new dependency set
- sortable rows and columns can compile against the new API
- no layout has been broadly migrated yet, but low-level wrappers are ready

### Phase 1 file inventory

Phase 1 added a small set of React-first DnD files. Their purpose is to prepare the new architecture without changing the board runtime all at once.

| File | Responsibility |
|---|---|
| `src/client/components/board/dndReactModel.ts` | Defines the new board DnD data contract: shared drag `type` constants, group constants, payload builders, and type guards for column drags, task drags, and task containers. This is the source of truth for what data travels through the new `DragDropProvider` operations. |
| `src/client/components/board/dndReactOps.ts` | Wraps the React-first event model: source/target extraction helpers and typed wrappers around `move()` for flat and grouped sortable collections. This prevents later phases from duplicating `event.operation.*` parsing everywhere. |
| `src/client/components/board/useHorizontalListReorderReact.ts` | New React-first replacement for list-column reordering. It manages `localListIds`, active list state, drag cancel behavior, and the list reorder mutation using the new provider event shape. |
| `src/client/components/board/useBoardColumnSortableReact.ts` | Thin wrapper around `@dnd-kit/react/sortable` for board columns. It applies the shared board column type, group, sortable id, and drag payload in one place. |
| `src/client/components/board/useBoardTaskSortableReact.ts` | Thin wrapper around `@dnd-kit/react/sortable` for task rows. It binds task id, container group, sortable id, and task drag payload so stacked and lanes can reuse the same task-row configuration later. |
| `src/client/components/board/useBoardTaskContainerDroppableReact.ts` | Thin wrapper around `@dnd-kit/react` `useDroppable` for task containers. It encodes container metadata, accepted task type, and low collision priority for empty-target drop behavior. |
| `src/client/components/list/ListHeader.tsx` | Updated to support a ref-based drag handle (`dragHandleRef`) in addition to the old listener-based handle. This allows the new sortable hooks to attach drag handles without forcing an immediate provider cutover. |
| `src/client/components/board/dndIds.ts` | Still owns board ids, but now uses `@dnd-kit/abstract` for `UniqueIdentifier` so it is no longer coupled to `@dnd-kit/core`. |

Notes:

- These files are preparation work for the new runtime path.
- They do **not** mean the board is already running on `DragDropProvider`.
- The current `DndContext` path remains active until Phase 2 cutover begins.

### Phase 1 design and communication flow

The Phase 1 design is intentionally layered. The goal is to make later cutover phases mostly about wiring, not about inventing the data model again.

#### 1. Shared data contract

`dndReactModel.ts` defines the new board-specific DnD vocabulary:

- what a column drag looks like
- what a task drag looks like
- what a task container looks like
- which dnd `type` values the board uses
- which sortable `group` values the board uses

Everything else in the new path depends on this file so that list/task/container semantics stay consistent across stacked and lanes.

#### 2. Event and move helpers

`dndReactOps.ts` sits one layer above the raw library API.

Responsibilities:

- read `event.operation.source`
- read `event.operation.target`
- read `source.data` / `target.data`
- apply `move()` to either:
  - flat collections such as list columns
  - grouped collections such as task containers

This means later hooks can talk in board terms instead of directly manipulating the provider event shape.

#### 3. Hook wrappers for reusable entities

The new entity hooks are small configuration wrappers:

- `useBoardColumnSortableReact.ts`
- `useBoardTaskSortableReact.ts`
- `useBoardTaskContainerDroppableReact.ts`

They do not own board state. Instead, they standardize how each entity registers itself with the new DnD system:

- a board column registers as a sortable column with the board column group and column drag payload
- a task row registers as a sortable item in its container group with task drag payload
- a task container registers as a droppable target that accepts task drags and carries list/status metadata

This keeps the per-component migration work smaller because components can call board-specific wrappers instead of manually repeating `type`, `group`, `accept`, `data`, and collision-priority setup.

#### 4. State and mutation layer

`useHorizontalListReorderReact.ts` is the first real stateful replacement hook in the new path.

It listens to the new drag events and coordinates:

- local optimistic list order
- active dragged list id
- cancel reset behavior
- persistence through `useReorderLists()`

Conceptually, it sits between:

- the entity wrappers that register draggable columns
- the future `DragDropProvider` root in `BoardColumns.tsx` / `BoardColumnsStacked.tsx`

#### 5. Existing components adapting to the new handle model

`ListHeader.tsx` now supports both handle styles:

- old path: attributes/listeners from legacy sortable hooks
- new path: `dragHandleRef` from the React-first sortable hook

This is an important bridge point because it allows the list-column component migration to happen without rewriting the list header behavior at the same time.

#### 6. Communication path in later phases

When the new runtime path is wired in, the intended communication chain is:

1. `BoardColumns.tsx` or `BoardColumnsStacked.tsx` mounts `DragDropProvider`
2. column components use `useBoardColumnSortableReact()`
3. task rows use `useBoardTaskSortableReact()`
4. task containers use `useBoardTaskContainerDroppableReact()`
5. provider events flow into:
   - `useHorizontalListReorderReact.ts` for column movement
   - later, a React-first replacement for task-container movement
6. board-specific persistence still lives in stacked/lanes hooks, not in the low-level wrappers

This separation is deliberate:

- wrappers describe **what an entity is**
- event helpers describe **how to read drag operations**
- reorder hooks describe **how board state changes**
- stacked/lanes hooks describe **how board-specific persistence works**

## Phase 2: migrate list-column drag path

Goal:

- migrate the simpler drag kind first

Target files:

- `src/client/components/board/useHorizontalListReorder.ts`
- `src/client/components/board/BoardColumns.tsx`
- `src/client/components/board/BoardColumnsStacked.tsx`
- `src/client/components/board/BoardListColumn.tsx`
- `src/client/components/board/BoardListStackedColumn.tsx`

Why do this before tasks:

- list drag is conceptually simpler
- it validates provider, event handling, overlay, and sortable-column behavior
- it reduces the number of unknowns before touching task movement logic

Acceptance criteria:

- horizontal list drag works in both layouts
- list order persists correctly
- drag cancel works

## Phase 3: migrate stacked task drag

Goal:

- migrate task DnD in the simpler layout before lanes

Target files:

- `src/client/components/board/useTaskDndCore.ts`
- `src/client/components/board/useStackedBoardDnd.ts`
- `src/client/components/board/BoardListStackedColumn.tsx`
- `src/client/components/board/SortableTaskRow.tsx`

Acceptance criteria:

- reorder inside one stacked list
- move task between stacked lists
- drop into empty list body
- cancel restores prior order
- persistence matches current server behavior
- filtered view reorder still merges correctly into full band order
- task movement follows the grouped-sortable plus droppable-container approach as closely as the board allows

## Phase 4: migrate lanes task drag

Goal:

- port the most complex layout after stacked is stable

Target files:

- `src/client/components/board/useLanesBoardDnd.ts`
- `src/client/components/board/ListStatusBand.tsx`
- `src/client/components/board/BoardColumns.tsx`
- shared portions of the task DnD state layer

Acceptance criteria:

- reorder inside one lane band
- move task between statuses in same list
- move task between lists and statuses
- empty-band drop works
- band weights UI is unaffected
- persistence and reorder mutations still happen in correct sequence
- lane-band movement follows the same grouped-sortable plus droppable-container pattern established in stacked

## Phase 5: cleanup and simplification

Goal:

- remove migration scaffolding and keep only the useful abstractions

Possible cleanup items:

- remove no-longer-needed adapter helpers
- simplify collision logic if new behavior makes some guards unnecessary
- remove redundant refs if event freshness is improved
- update docs:
  - `docs/board-dnd-architecture.md`
  - `docs/drag_drop.md`
  - `docs/board-drag-performance-notes.md`

### Phase 5 completion notes

Cleanup completed in the final React-first cutover:

- deleted the legacy `useTaskDndCore.ts` state machine
- deleted the legacy `useHorizontalListReorder.ts` list path
- removed the legacy `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` dependencies
- replaced the old shared task core with `useBoardTaskDndReact.ts`
- removed the legacy sortable fallback from `SortableTaskRow.tsx`
- simplified list drag handles to the ref-based React-first path only
- refreshed architecture docs to describe the new runtime

## Risks

### 1. Collision behavior regresses

Risk:

- task hover target becomes unstable again
- empty-container drops stop working reliably
- list and task droppables interfere with each other

Mitigation:

- keep the current collision rules documented before changing them
- test stacked and lanes separately
- capture videos or short notes during the spike for side-by-side comparison

### 2. Cancel and optimistic revert behavior regresses

Risk:

- drag cancel leaves UI in a stale local order
- pending optimistic map clears too early or too late

Mitigation:

- test `Escape`-cancel explicitly
- preserve start-map snapshots during migration until proven unnecessary

### 3. Overlay visuals regress

Risk:

- drag clone no longer matches current visuals
- overlay interacts poorly with hit-testing

Mitigation:

- preserve overlay content component
- revalidate drop targets with overlay active

### 4. Migration scope sprawls

Risk:

- cleanup and opportunistic refactors creep into the migration
- the board spends too long in a half-old, half-new state

Mitigation:

- keep each phase scoped to a small, testable slice
- do not mix unrelated board cleanup into migration phases
- delete temporary scaffolding only after both layouts are stable

## Testing plan

Manual validation should be the default for the discovery phase and early migration phases.

Minimum test matrix:

### Lists

- drag one list left/right in stacked
- drag one list left/right in lanes
- cancel list drag

### Stacked tasks

- reorder within one list
- move between lists
- move into empty list
- drag cancel
- overlay rendering
- filtered group active

### Lanes tasks

- reorder within one band
- move between statuses
- move between lists
- move into empty band
- drag cancel
- filtered group active

### Persistence

- no-op drop does not mutate
- reorder mutation only fires when order changes
- move mutation still updates list/status correctly
- hidden tasks preserve relative order when visible tasks are reordered

## Implementation questions to resolve in Phase 0

- What is the exact package/API import set needed to implement the official guide in this codebase?
- Can list drag and task drag still share one root cleanly in the new provider model?
- Which custom collision code can be deleted outright versus re-expressed?
- Does overlay behavior change drop target resolution in a way that affects our board layouts?
- Which parts of task persistence remain custom no matter what library API we use?

## Cutover criteria

The migration is considered complete when all of the following are true:

- list drag works in stacked and lanes
- stacked task drag works for reorder, cross-list move, empty-drop, and cancel
- lanes task drag works for reorder, cross-band move, empty-drop, and cancel
- overlay behavior is stable in both layouts
- persistence behavior matches current product expectations
- old DnD-specific scaffolding is removed

## Suggested deliverables

1. Phase 0 mapping note and target API decisions
2. Shared wrapper/adaptor layer for the new DnD primitives, only if still needed after Phase 0
3. List-drag migration completed in both layouts
4. Stacked task-drag migration completed
5. Lanes task-drag migration completed
6. Cleanup pass and updated docs

## Related docs

- `docs/board-dnd-architecture.md`
- `docs/board-drag-performance-notes.md`
- `docs/drag_drop.md`
