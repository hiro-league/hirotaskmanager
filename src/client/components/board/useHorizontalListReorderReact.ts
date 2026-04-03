import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Board } from "../../../shared/models";
import { useReorderLists } from "@/api/mutations";
import { parseListSortableId } from "./dndIds";
import {
  getOperationSourceData,
  getOperationTargetData,
  getOperationTargetId,
  moveFlatSortableItems,
  type BoardReactDragEndEvent,
  type BoardReactDragOverEvent,
  type BoardReactDragStartEvent,
} from "./dndReactOps";
import { isBoardColumnDragData } from "./dndReactModel";
import { useBoardKeyboardNavOptional } from "./shortcuts/BoardKeyboardNavContext";

export function sortedListIds(board: Board): number[] {
  return [...board.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.id);
}

/**
 * React-first list reorder state for the new DragDropProvider flow.
 * We keep this separate from the current hook so Phase 1 can build the
 * replacement path without destabilizing the existing runtime yet.
 */
export function useHorizontalListReorderReact(board: Board) {
  const boardNav = useBoardKeyboardNavOptional();
  const reorder = useReorderLists();

  const serverListIds = useMemo(() => sortedListIds(board), [board]);

  const [localListIds, setLocalListIds] = useState(serverListIds);
  const localListIdsRef = useRef(localListIds);
  localListIdsRef.current = localListIds;

  const [activeId, setActiveId] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastLoggedTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalListIds(serverListIds);
    }
  }, [serverListIds]);

  const boardRef = useRef(board);
  boardRef.current = board;

  const onDragStart = useCallback((event: BoardReactDragStartEvent) => {
    const sourceData = getOperationSourceData(event);
    if (isBoardColumnDragData(sourceData)) {
      isDraggingRef.current = true;
      setActiveId(sourceData.listId);
      // A list drag should keep that list current even if it lands back in place.
      boardNav?.selectList(sourceData.listId);
      lastLoggedTargetIdRef.current = null;
      // Temporary Phase 2 logging so manual testing can confirm provider events
      // are firing before the task-path migration is complete.
      console.debug("[board-list-dnd-react] dragstart", {
        sourceId: event.operation.source?.id ?? null,
        sourceData,
      });
      return;
    }

    const sourceId =
      event.operation.source?.id != null
        ? parseListSortableId(event.operation.source.id)
        : null;
    if (sourceId != null) {
      isDraggingRef.current = true;
      setActiveId(sourceId);
      boardNav?.selectList(sourceId);
      lastLoggedTargetIdRef.current = null;
      console.debug("[board-list-dnd-react] dragstart", {
        sourceId: event.operation.source?.id ?? null,
        sourceData,
      });
    }
  }, [boardNav]);

  const onDragOver = useCallback((event: BoardReactDragOverEvent) => {
    const sourceData = getOperationSourceData(event);
    const targetData = getOperationTargetData(event);
    const sourceId =
      event.operation.source?.id != null
        ? parseListSortableId(event.operation.source.id)
        : null;
    if (!isBoardColumnDragData(sourceData) && sourceId == null) return;
    const targetId = getOperationTargetId(event);
    if (targetId !== lastLoggedTargetIdRef.current) {
      lastLoggedTargetIdRef.current = targetId;
      console.debug("[board-list-dnd-react] dragover", {
        sourceId: event.operation.source?.id ?? null,
        targetId,
        sourceData,
        targetData,
      });
    }
  }, []);

  const onDragEnd = useCallback(
    (event: BoardReactDragEndEvent) => {
      isDraggingRef.current = false;
      setActiveId(null);

      if (event.canceled) {
        console.debug("[board-list-dnd-react] dragend", {
          canceled: true,
          sourceId: event.operation.source?.id ?? null,
          targetId: event.operation.target?.id ?? null,
        });
        setLocalListIds(sortedListIds(boardRef.current));
        return;
      }

      const sourceData = getOperationSourceData(event);
      const targetData = getOperationTargetData(event);
      const sourceId =
        event.operation.source?.id != null
          ? parseListSortableId(event.operation.source.id)
          : null;
      if (!isBoardColumnDragData(sourceData) && sourceId == null) return;

      const finalOrder = moveFlatSortableItems(localListIdsRef.current, event);
      const serverOrder = sortedListIds(boardRef.current);

      console.debug("[board-list-dnd-react] dragend", {
        canceled: false,
        sourceId: event.operation.source?.id ?? null,
        targetId: event.operation.target?.id ?? null,
        sourceData,
        targetData,
        finalOrder,
        serverOrder,
      });

      setLocalListIds(finalOrder);

      if (finalOrder.join(",") === serverOrder.join(",")) return;

      reorder.mutate({
        boardId: boardRef.current.id,
        orderedListIds: finalOrder,
      });
    },
    [reorder],
  );

  return {
    localListIds,
    activeId,
    onDragStart,
    onDragOver,
    onDragEnd,
    reorderPending: reorder.isPending,
  };
}
