import {
  DragOverlay as ReactDragOverlay,
  DragDropProvider,
} from "@dnd-kit/react";
import { useCallback, useEffect, useState } from "react";
import type { Board } from "../../../shared/models";
import { AddListSlot } from "./BoardColumns";
import { BoardDragOverlayContent } from "./BoardDragOverlayContent";
import { BoardListStackedColumn } from "./BoardListStackedColumn";
import { stackedListContainerId } from "./dndIds";
import { useBoardKeyboardNavOptional } from "./shortcuts/BoardKeyboardNavContext";
import { useStackedBoardDnd } from "./useStackedBoardDnd";

interface BoardColumnsStackedProps {
  board: Board;
}
export function BoardColumnsStacked({ board }: BoardColumnsStackedProps) {
  const {
    localListIds,
    activeId: activeListId,
    activeTaskId,
    displayTaskMap,
    onDragStart,
    onDragOver,
    onDragEnd,
  } = useStackedBoardDnd(board);

  const boardKeyboardNav = useBoardKeyboardNavOptional();
  const [addListOpen, setAddListOpen] = useState(false);
  const [insertAfterListId, setInsertAfterListId] = useState<number | null>(null);
  useEffect(() => {
    boardKeyboardNav?.setListColumnOrder(localListIds);
  }, [boardKeyboardNav, localListIds]);

  useEffect(() => {
    return boardKeyboardNav?.registerOpenAddListComposer((anchorListId) => {
      // Stacked layout shares the same inline-after-anchor behavior as lanes.
      setInsertAfterListId(anchorListId);
      setAddListOpen(true);
    });
  }, [boardKeyboardNav]);

  const closeAddList = useCallback(() => {
    setAddListOpen(false);
    setInsertAfterListId(null);
  }, []);

  const overlayTask =
    activeTaskId != null
      ? board.tasks.find((task) => task.id === activeTaskId)
      : undefined;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DragDropProvider
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          role="list"
          aria-label="Board lists"
        >
          <div className="flex w-max min-w-full flex-row items-start gap-5 bg-transparent pb-1">
            <div className="flex flex-row items-start gap-4">
              {localListIds.flatMap((id, index) => {
                const items = [
                  <BoardListStackedColumn
                    key={id}
                    board={board}
                    listId={id}
                    listIndex={index}
                    taskContainerId={stackedListContainerId(id)}
                    sortableIds={displayTaskMap[stackedListContainerId(id)] ?? []}
                  />,
                ];
                if (addListOpen && insertAfterListId === id) {
                  items.push(
                    <AddListSlot
                      key={`add-after-${id}`}
                      boardId={board.id}
                      open
                      insertAfterListId={insertAfterListId}
                      onOpen={setInsertAfterListId}
                      onClose={closeAddList}
                      stacked
                    />,
                  );
                }
                return items;
              })}
            </div>
            <AddListSlot
              boardId={board.id}
              open={addListOpen && insertAfterListId == null}
              insertAfterListId={null}
              onOpen={(anchorListId) => {
                setInsertAfterListId(anchorListId);
                setAddListOpen(true);
              }}
              onClose={closeAddList}
              stacked
            />
          </div>
        </div>
        <ReactDragOverlay dropAnimation={null} style={{ zIndex: 60 }}>
          {overlayTask != null || activeListId != null ? (
            <BoardDragOverlayContent
              board={board}
              overlayTask={overlayTask}
              activeListId={activeListId}
              layout="stacked"
            />
          ) : null}
        </ReactDragOverlay>
      </DragDropProvider>
    </div>
  );
}
