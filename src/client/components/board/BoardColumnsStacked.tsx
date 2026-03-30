import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
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
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { Board } from "../../../shared/models";
import { AddListSlot } from "./BoardColumns";
import { useReorderLists } from "@/api/mutations";
import {
  BoardListStackedColumn,
  BoardListStackedColumnOverlay,
} from "./BoardListStackedColumn";

interface BoardColumnsStackedProps {
  board: Board;
}

function sortedListIds(board: Board): string[] {
  return [...board.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.id);
}

const listCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;
  return closestCenter(args);
};

export function BoardColumnsStacked({ board }: BoardColumnsStackedProps) {
  const reorder = useReorderLists();

  const serverListIds = useMemo(() => sortedListIds(board), [board]);

  const [localListIds, setLocalListIds] = useState(serverListIds);
  const localListIdsRef = useRef(localListIds);
  localListIdsRef.current = localListIds;

  const [activeId, setActiveId] = useState<string | null>(null);
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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    isDraggingRef.current = true;
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (over == null) return;
    const aid = String(active.id);
    const oid = String(over.id);
    if (aid === oid) return;

    setLocalListIds((prev) => {
      const oldIndex = prev.indexOf(aid);
      const newIndex = prev.indexOf(oid);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleDragEnd = useCallback(
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

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveId(null);
    setLocalListIds(sortedListIds(boardRef.current));
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={listCollision}
        measuring={{
          droppable: { strategy: MeasuringStrategy.Always },
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          role="list"
          aria-label="Board lists"
        >
          <div className="flex w-max min-w-full flex-row items-start gap-5 bg-transparent pb-1">
            <SortableContext
              items={localListIds}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex flex-row items-start gap-4">
                {localListIds.map((id) => (
                  <BoardListStackedColumn
                    key={id}
                    board={board}
                    listId={id}
                  />
                ))}
              </div>
            </SortableContext>
            <AddListSlot boardId={board.id} stacked />
          </div>
        </div>
        <DragOverlay dropAnimation={null} zIndex={60}>
          {activeId ? (
            <BoardListStackedColumnOverlay
              board={board}
              listId={activeId}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
