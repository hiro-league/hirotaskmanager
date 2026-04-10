import {
  DragOverlay as ReactDragOverlay,
  DragDropProvider,
} from "@dnd-kit/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Board } from "../../../shared/models";
import { AddListSlot } from "./BoardColumns";
import { BoardDragOverlayContent } from "./BoardDragOverlayContent";
import { BoardListStackedColumn } from "./BoardListStackedColumn";
import { boardColumnSpreadProps } from "./boardColumnData";
import { stackedListContainerId } from "./dndIds";
import { useBoardKeyboardNavOptional } from "./shortcuts/BoardKeyboardNavContext";
import { useStackedBoardDnd } from "./useStackedBoardDnd";

interface BoardColumnsStackedProps {
  board: Board;
}

/** First-paint cap for stacked list columns (board perf plan #9B). */
const STACKED_COLUMNS_INITIAL_MOUNT = 8;
const STACKED_COLUMNS_IDLE_BATCH = 8;
const STACKED_COLUMN_IDLE_TIMEOUT_MS = 2000;

function scheduleChunkedColumnMount(cb: () => void): number {
  if (typeof requestIdleCallback === "function") {
    return requestIdleCallback(cb, { timeout: STACKED_COLUMN_IDLE_TIMEOUT_MS });
  }
  return window.setTimeout(cb, 1) as unknown as number;
}

function cancelChunkedColumnMount(id: number): void {
  if (typeof cancelIdleCallback === "function") {
    cancelIdleCallback(id);
  } else {
    window.clearTimeout(id);
  }
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
    tasksByListStatus,
    visibleStatuses,
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

  const listLen = localListIds.length;
  const prevBoardIdRef = useRef(board.boardId);
  const [mountedColumnCount, setMountedColumnCount] = useState(() =>
    Math.min(STACKED_COLUMNS_INITIAL_MOUNT, listLen),
  );

  // New board: remount budget from scratch (#9B).
  useEffect(() => {
    if (prevBoardIdRef.current !== board.boardId) {
      prevBoardIdRef.current = board.boardId;
      setMountedColumnCount(Math.min(STACKED_COLUMNS_INITIAL_MOUNT, listLen));
    }
  }, [board.boardId, listLen]);

  // Fewer lists (delete, etc.): keep mounted index valid.
  useEffect(() => {
    setMountedColumnCount((c) => Math.min(c, listLen));
  }, [listLen]);

  // Mount remaining columns in idle batches so the main thread can paint between chunks.
  useEffect(() => {
    if (mountedColumnCount >= listLen) return;
    const idleId = scheduleChunkedColumnMount(() => {
      setMountedColumnCount((c) =>
        Math.min(c + STACKED_COLUMNS_IDLE_BATCH, listLen),
      );
    });
    return () => cancelChunkedColumnMount(idleId);
  }, [mountedColumnCount, listLen]);

  const overlayTask =
    activeTaskId != null
      ? board.tasks.find((task) => task.taskId === activeTaskId)
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
                const list = board.lists.find((l) => l.listId === id);
                if (!list) return [];
                const items: ReactNode[] = [];
                if (index < mountedColumnCount) {
                  items.push(
                    <BoardListStackedColumn
                      key={id}
                      {...boardColumnSpreadProps(board)}
                      list={list}
                      listId={id}
                      listIndex={index}
                      taskContainerId={stackedListContainerId(id)}
                      sortableIds={
                        displayTaskMap[stackedListContainerId(id)] ?? []
                      }
                      tasksByListStatus={tasksByListStatus}
                    />,
                  );
                } else {
                  // Width placeholder until this column's batch mounts (#9B).
                  items.push(
                    <div
                      key={`stacked-col-ph-${id}`}
                      className="relative flex w-72 shrink-0 flex-col self-start"
                      aria-hidden
                      data-stacked-column-placeholder
                    />,
                  );
                }
                if (addListOpen && insertAfterListId === id) {
                  items.push(
                    <AddListSlot
                      key={`add-after-${id}`}
                      boardId={board.boardId}
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
              boardId={board.boardId}
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
              tasksByListStatus={tasksByListStatus}
              visibleStatuses={visibleStatuses}
            />
          ) : null}
        </ReactDragOverlay>
      </DragDropProvider>
    </div>
  );
}
