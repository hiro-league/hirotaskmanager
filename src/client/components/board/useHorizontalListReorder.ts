import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Board } from "../../../shared/models";
import { useReorderLists } from "@/api/mutations";

export function sortedListIds(board: Board): number[] {
  return [...board.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.id);
}

export const listCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;
  return closestCenter(args);
};

/**
 * Local list order during horizontal drag, sensors, and reorder mutation for list columns (lanes + stacked).
 */
export function useHorizontalListReorder(board: Board) {
  const reorder = useReorderLists();

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
      disabled: reorder.isPending,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      disabled: reorder.isPending,
    }),
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    isDraggingRef.current = true;
    setActiveId(Number(event.active.id));
  }, []);

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (over == null) return;
    const aid = Number(active.id);
    const oid = Number(over.id);
    if (aid === oid) return;

    setLocalListIds((prev) => {
      const oldIndex = prev.indexOf(aid);
      const newIndex = prev.indexOf(oid);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const onDragEnd = useCallback(
    (_event: DragEndEvent) => {
      isDraggingRef.current = false;
      setActiveId(null);

      const finalOrder = localListIdsRef.current;
      const serverOrder = sortedListIds(boardRef.current);

      if (finalOrder.join(",") === serverOrder.join(",")) return;

      reorder.mutate({
        boardId: boardRef.current.id,
        orderedListIds: finalOrder,
      });
    },
    [reorder],
  );

  const onDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveId(null);
    setLocalListIds(sortedListIds(boardRef.current));
  }, []);

  return {
    localListIds,
    activeId,
    sensors,
    listCollision,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    reorderPending: reorder.isPending,
  };
}
