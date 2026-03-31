import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo } from "react";
import type { Board } from "../../../shared/models";
import { sortableListId, stackedListContainerId } from "./dndIds";
import { AddListSlot } from "./BoardColumns";
import { BoardDragOverlayContent } from "./BoardDragOverlayContent";
import { BoardListStackedColumn } from "./BoardListStackedColumn";
import { useBoardKeyboardNavOptional } from "./shortcuts/BoardKeyboardNavContext";
import { useStackedBoardDnd } from "./useStackedBoardDnd";

interface BoardColumnsStackedProps {
  board: Board;
}

export function BoardColumnsStacked({ board }: BoardColumnsStackedProps) {
  const {
    localListIds,
    activeId,
    sensors,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    displayTaskMap,
    activeTaskId,
  } = useStackedBoardDnd(board);

  const boardKeyboardNav = useBoardKeyboardNavOptional();
  useEffect(() => {
    boardKeyboardNav?.setListColumnOrder(localListIds);
  }, [boardKeyboardNav, localListIds]);

  const overlayTask =
    activeTaskId != null
      ? board.tasks.find((t) => t.id === activeTaskId)
      : undefined;

  const sortableListItemIds = useMemo(
    () => localListIds.map(sortableListId),
    [localListIds],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{
          droppable: { strategy: MeasuringStrategy.BeforeDragging },
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          role="list"
          aria-label="Board lists"
        >
          <div className="flex w-max min-w-full flex-row items-start gap-5 bg-transparent pb-1">
            <SortableContext
              items={sortableListItemIds}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex flex-row items-start gap-4">
                {localListIds.map((id) => (
                  <BoardListStackedColumn
                    key={id}
                    board={board}
                    listId={id}
                    stackedTaskMap={displayTaskMap}
                    taskContainerId={stackedListContainerId(id)}
                  />
                ))}
              </div>
            </SortableContext>
            <AddListSlot boardId={board.id} stacked />
          </div>
        </div>
        <DragOverlay dropAnimation={null} zIndex={60}>
          <BoardDragOverlayContent
            board={board}
            overlayTask={overlayTask}
            activeListId={activeId}
            layout="stacked"
          />
        </DragOverlay>
      </DndContext>
    </div>
  );
}
