import { move } from "@dnd-kit/helpers";
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/react";
import type { Data, UniqueIdentifier } from "@dnd-kit/abstract";

export type BoardReactDragStartEvent = Parameters<DragStartEvent>[0];
export type BoardReactDragOverEvent = Parameters<DragOverEvent>[0];
export type BoardReactDragEndEvent = Parameters<DragEndEvent>[0];

export type BoardReactDndEvent =
  | BoardReactDragStartEvent
  | BoardReactDragOverEvent
  | BoardReactDragEndEvent;

export type GroupedSortableItems = Record<string, string[]>;

// Phase 1 migration helper: centralize the new provider event shape so the
// later provider swap can reuse typed source/target access across list and
// task drag flows instead of re-parsing `event.operation` in every file.
export function getOperationSourceId(event: BoardReactDndEvent): string | null {
  return normalizeOperationId(event.operation.source?.id);
}

export function getOperationTargetId(event: BoardReactDndEvent): string | null {
  return normalizeOperationId(event.operation.target?.id);
}

export function getOperationSourceData<T extends Data = Data>(
  event: BoardReactDndEvent,
): T | null {
  return (event.operation.source?.data as T | undefined) ?? null;
}

export function getOperationTargetData<T extends Data = Data>(
  event: BoardReactDndEvent,
): T | null {
  return (event.operation.target?.data as T | undefined) ?? null;
}

export function moveFlatSortableItems<T extends UniqueIdentifier>(
  items: T[],
  event: BoardReactDragOverEvent | BoardReactDragEndEvent,
): T[] {
  return move(items, event);
}

export function moveGroupedSortableItems(
  items: GroupedSortableItems,
  event: BoardReactDragOverEvent | BoardReactDragEndEvent,
): GroupedSortableItems {
  return move(items, event);
}

export function normalizeOperationId(
  id: UniqueIdentifier | null | undefined,
): string | null {
  return id == null ? null : String(id);
}
