import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { Board } from "../../../shared/models";
import { AddListSlot } from "./BoardColumns";
import {
  BoardListStackedColumn,
  BoardListStackedColumnOverlay,
} from "./BoardListStackedColumn";
import { useHorizontalListReorder } from "./useHorizontalListReorder";

interface BoardColumnsStackedProps {
  board: Board;
}

export function BoardColumnsStacked({ board }: BoardColumnsStackedProps) {
  const {
    localListIds,
    activeId,
    sensors,
    listCollision,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useHorizontalListReorder(board);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={listCollision}
        measuring={{
          droppable: { strategy: MeasuringStrategy.Always },
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
