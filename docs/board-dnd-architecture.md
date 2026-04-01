# Board drag-and-drop architecture

This document describes the current board DnD architecture after the React-first migration. For generic drag-and-drop concepts, see [`drag_drop.md`](./drag_drop.md).

## Overview

The board now uses the React-first `@dnd-kit/react` stack everywhere:

- `DragDropProvider` at the layout root
- `useSortable()` wrappers for list columns and task rows
- `useDroppable()` wrappers for task containers and lane bands
- grouped multi-container task movement with `move(...)` from `@dnd-kit/helpers`

The old `DndContext` / `SortableContext` board path has been removed.

## Main layers

| Layer | Responsibility |
|------|------|
| `BoardColumns.tsx` | Lanes root provider, overlay, list order, task-map wiring, status-band sizing |
| `BoardColumnsStacked.tsx` | Stacked root provider, overlay, list order, task-map wiring |
| `useHorizontalListReorderReact.ts` | Shared list-column reorder state and persistence |
| `useBoardTaskDndReact.ts` | Shared grouped task-drag lifecycle: local container map, pending map, active task, `onDragStart` / `onDragOver` / `onDragEnd` |
| `useStackedBoardDnd.ts` | Stacked container-map builder and stacked persistence |
| `useLanesBoardDnd.ts` | Lanes container-map builder and lanes persistence |
| `useBoardColumnSortableReact.ts` | Board column sortable wrapper |
| `useBoardTaskSortableReact.ts` | Board task sortable wrapper |
| `useBoardTaskContainerDroppableReact.ts` | Board task-container droppable wrapper |
| `dndIds.ts` | Stable ids for lists, tasks, stacked list containers, and lane bands |

## Data model

Task drag works from a grouped container map:

```ts
Record<string, string[]>
```

- keys are container ids
- values are ordered sortable task ids such as `task-42`

Stacked uses one container per list:

- `stacked-list-<listId>`

Lanes uses one container per `(list, status)` band:

- `lane-band-<listId>:<status>`

## Shared task state

`useBoardTaskDndReact.ts` owns the runtime task-drag state:

- `serverTaskMap`: derived from the layout hook's `buildContainerMap()`
- `taskContainers`: optimistic grouped order during drag
- `pendingTaskMap`: temporary post-drop bridge until server data matches
- `activeTaskId`: active dragged task for the overlay

The rendered task source of truth is:

```text
taskContainers ?? pendingTaskMap ?? serverTaskMap
```

## Drag routing

List and task drag still share one provider tree.

Routing is based on the source drag payload:

- column drags go through `useHorizontalListReorderReact.ts`
- task drags go through `useBoardTaskDndReact.ts`

That means both layouts keep one provider but separate persistence logic for:

- list reorder
- stacked task moves
- lanes task moves across lists and statuses

## Task movement flow

The task flow follows the official grouped multi-sortable-list pattern:

1. `onDragStart` snapshots the starting grouped map and stores the active task id.
2. `onDragOver` updates the grouped map with `moveGroupedSortableItems(...)`.
3. `onDragEnd` compares start and end maps.
4. If nothing changed, no server mutation runs.
5. If order changed, the layout-specific persistence hook applies list/status updates and band reorder mutations.

## Layout-specific behavior

`useStackedBoardDnd.ts`

- builds one merged visible task list per board list
- persists list moves with `updateTask`
- persists per-status ordering with `reorderTasksInBand`

`useLanesBoardDnd.ts`

- builds one container per `(list, status)` band
- persists cross-band moves with `updateTask`
- persists per-band ordering with `reorderTasksInBand`

Both layouts use `mergeFilteredOrderIntoFullBand(...)` so filtered views reorder only visible tasks while preserving hidden task positions.

## Components

`BoardListStackedColumn.tsx`

- renders the stacked list shell
- attaches the list drag handle via `dragHandleRef`
- mounts one explicit task droppable container for empty-list drops

`BoardListColumn.tsx`

- renders the lane list shell
- freezes band heights while a task drag is active to reduce layout churn

`ListStatusBand.tsx`

- renders one lane band
- mounts the band droppable container
- renders sortable task rows for that band

`SortableTaskRow.tsx`

- uses the React-first task sortable wrapper only
- no legacy sortable fallback remains

## Primary files

| File | Role |
|------|------|
| `src/client/components/board/BoardColumns.tsx` | Lanes root provider and overlay |
| `src/client/components/board/BoardColumnsStacked.tsx` | Stacked root provider and overlay |
| `src/client/components/board/useHorizontalListReorderReact.ts` | Shared list reorder |
| `src/client/components/board/useBoardTaskDndReact.ts` | Shared task drag lifecycle |
| `src/client/components/board/useLanesBoardDnd.ts` | Lanes task config + persistence |
| `src/client/components/board/useStackedBoardDnd.ts` | Stacked task config + persistence |
| `src/client/components/board/useBoardColumnSortableReact.ts` | Column sortable wrapper |
| `src/client/components/board/useBoardTaskSortableReact.ts` | Task sortable wrapper |
| `src/client/components/board/useBoardTaskContainerDroppableReact.ts` | Task droppable wrapper |
| `src/client/components/board/BoardListColumn.tsx` | Lanes list column |
| `src/client/components/board/BoardListStackedColumn.tsx` | Stacked list column |
| `src/client/components/board/ListStatusBand.tsx` | Lanes task band |
| `src/client/components/board/SortableTaskRow.tsx` | Sortable task row |
| `src/client/components/board/dndIds.ts` | Stable ids |

For performance-focused notes, see [`board-drag-performance-notes.md`](./board-drag-performance-notes.md).
