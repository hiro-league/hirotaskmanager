import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Board } from "../../../../shared/models";
import { useMoveList } from "@/api/mutations";
import { parseListSortableId } from "./dndIds";
import {
  getOperationSourceData,
  moveFlatSortableItems,
  type BoardReactDragEndEvent,
  type BoardReactDragOverEvent,
  type BoardReactDragStartEvent,
} from "./dndReactOps";
import { isBoardColumnDragData } from "./dndReactModel";
import { useBoardKeyboardNavOptional } from "../shortcuts/BoardKeyboardNavContext";

export function sortedListIds(board: Board): number[] {
  return [...board.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.listId);
}

/**
 * React-first list reorder state for the new DragDropProvider flow.
 * We keep this separate from the current hook so Phase 1 can build the
 * replacement path without destabilizing the existing runtime yet.
 */
export function useHorizontalListReorderReact(board: Board) {
  const boardNav = useBoardKeyboardNavOptional();
  const moveList = useMoveList();

  const serverListIds = useMemo(() => sortedListIds(board), [board]);

  const [localListIds, setLocalListIds] = useState(serverListIds);
  const localListIdsRef = useRef(localListIds);
  localListIdsRef.current = localListIds;

  const [activeId, setActiveId] = useState<number | null>(null);
  const isDraggingRef = useRef(false);

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
    }
  }, [boardNav]);

  const onDragOver = useCallback((_event: BoardReactDragOverEvent) => {}, []);

  const onDragEnd = useCallback(
    (event: BoardReactDragEndEvent) => {
      isDraggingRef.current = false;
      setActiveId(null);

      if (event.canceled) {
        setLocalListIds(sortedListIds(boardRef.current));
        return;
      }

      const sourceData = getOperationSourceData(event);
      const sourceId =
        event.operation.source?.id != null
          ? parseListSortableId(event.operation.source.id)
          : null;
      if (!isBoardColumnDragData(sourceData) && sourceId == null) return;

      const finalOrder = moveFlatSortableItems(localListIdsRef.current, event);
      const serverOrder = sortedListIds(boardRef.current);

      setLocalListIds(finalOrder);

      if (finalOrder.join(",") === serverOrder.join(",")) return;

      const movedListId =
        isBoardColumnDragData(sourceData) ? sourceData.listId : sourceId;
      if (movedListId == null) return;
      const movedIndex = finalOrder.indexOf(movedListId);
      if (movedIndex < 0) return;
      if (movedIndex === 0) {
        moveList.mutate({
          boardId: boardRef.current.boardId,
          listId: movedListId,
          position: "first",
        });
        return;
      }
      if (movedIndex === finalOrder.length - 1) {
        moveList.mutate({
          boardId: boardRef.current.boardId,
          listId: movedListId,
          position: "last",
        });
        return;
      }
      moveList.mutate({
        boardId: boardRef.current.boardId,
        listId: movedListId,
        beforeListId: finalOrder[movedIndex + 1],
      });
    },
    [moveList],
  );

  return {
    localListIds,
    activeId,
    onDragStart,
    onDragOver,
    onDragEnd,
    reorderPending: moveList.isPending,
  };
}
