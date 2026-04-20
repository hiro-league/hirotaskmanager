import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  groupDisplayLabelForId,
  type Board,
  type Task,
} from "../../../../shared/models";
import type { TaskCardViewMode } from "@/store/preferences";
import { taskCardInlineEditFor, taskReleasePill } from "@/components/task/TaskCard";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { cn } from "@/lib/utils";
import { parseTaskSortableId } from "../dnd/dndIds";
import { SortableTaskRow } from "../dnd/SortableTaskRow";
import { useBoardTaskContainerDroppableReact } from "../dnd/useBoardTaskContainerDroppableReact";
import { useVirtualizedBand } from "./useVirtualizedBand";
import type { TaskCardOverflowBoardData } from "@/components/board/boardColumnData";

/** Per-row component that derives stable callbacks from task id */
export const StackedSortableTaskRowById = memo(function StackedSortableTaskRowById({
  sid,
  containerId,
  index,
  task,
  taskGroups,
  taskPriorities,
  releases,
  viewMode,
  onComplete,
  onEdit,
  editingTitleTaskId,
  editingTitleDraft,
  onTitleDraftChange,
  onTitleCommit,
  onTitleCancel,
  titleEditBusy,
  taskOverflowBoard,
}: {
  sid: string;
  containerId: string;
  index: number;
  task: Task;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  releases: Board["releases"];
  taskOverflowBoard: TaskCardOverflowBoardData;
  viewMode: TaskCardViewMode;
  onComplete: (taskId: number, anchorEl?: HTMLElement) => void;
  onEdit: (taskId: number) => void;
  editingTitleTaskId: number | null;
  editingTitleDraft: string;
  onTitleDraftChange: (value: string) => void;
  onTitleCommit: () => void;
  onTitleCancel: () => void;
  titleEditBusy: boolean;
}) {
  const handleOpen = useCallback(() => onEdit(task.taskId), [onEdit, task.taskId]);
  const handleCompleteFromCircle = useCallback(
    (anchorEl: HTMLElement) => onComplete(task.taskId, anchorEl),
    [onComplete, task.taskId],
  );
  return (
    <SortableTaskRow
      sortableId={sid}
      containerId={containerId}
      index={index}
      task={task}
      taskPriorities={taskPriorities}
      viewMode={viewMode}
      groupLabel={groupDisplayLabelForId(taskGroups, task.groupId)}
      releasePill={taskReleasePill({ releases }, task)}
      onOpen={handleOpen}
      inlineEdit={taskCardInlineEditFor(task.taskId, editingTitleTaskId, editingTitleDraft, {
        setDraft: onTitleDraftChange,
        commit: onTitleCommit,
        cancel: onTitleCancel,
        busy: titleEditBusy,
      })}
      onCompleteFromCircle={
        task.status === "open" ? handleCompleteFromCircle : undefined
      }
      overflowActionsBoard={taskOverflowBoard}
    />
  );
});

export const StackedSortableList = memo(function StackedSortableList({
  taskMap,
  taskGroups,
  taskPriorities,
  releases,
  viewMode,
  listId,
  containerId,
  sortableIds,
  onComplete,
  onEdit,
  editingTitleTaskId,
  editingTitleDraft,
  onTitleDraftChange,
  onTitleCommit,
  onTitleCancel,
  titleEditBusy,
  quickAddInsertIndex,
  quickAddComposer,
  getScrollElement,
  enableVirtualization,
  taskOverflowBoard,
}: {
  taskMap: Map<number, Task>;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  releases: Board["releases"];
  taskOverflowBoard: TaskCardOverflowBoardData;
  viewMode: TaskCardViewMode;
  listId: number;
  containerId: string;
  sortableIds: string[];
  onComplete: (taskId: number, anchorEl?: HTMLElement) => void;
  onEdit: (taskId: number) => void;
  editingTitleTaskId: number | null;
  editingTitleDraft: string;
  onTitleDraftChange: (value: string) => void;
  onTitleCommit: () => void;
  onTitleCancel: () => void;
  titleEditBusy: boolean;
  quickAddInsertIndex: number | null;
  quickAddComposer?: ReactNode;
  getScrollElement: () => HTMLElement | null;
  enableVirtualization: boolean;
}) {
  const { ref, isDropTarget } = useBoardTaskContainerDroppableReact({
    containerId,
    layout: "stacked",
    listId,
  });
  const boardNav = useBoardKeyboardNavOptional();
  const sortableTaskIds = useMemo(
    () =>
      sortableIds
        .map((sid) => parseTaskSortableId(sid))
        .filter((taskId): taskId is number => taskId != null),
    [sortableIds],
  );
  const {
    shouldVirtualize,
    virtualItems,
    totalSize,
    measureElement,
    revealTask,
  } = useVirtualizedBand({
    count: sortableIds.length,
    itemIds: sortableTaskIds,
    getScrollElement,
    viewMode,
    enabled: enableVirtualization && quickAddComposer == null,
  });

  useEffect(() => {
    if (!boardNav || !shouldVirtualize || sortableTaskIds.length === 0) return;
    return boardNav.registerTaskRevealer(revealTask);
  }, [boardNav, revealTask, shouldVirtualize, sortableTaskIds.length]);

  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-8 flex-col gap-2 rounded-md",
        isDropTarget && "bg-primary/[0.07] ring-1 ring-primary/15",
      )}
    >
      {shouldVirtualize ? (
        <div
          className="relative w-full"
          style={{ height: `${Math.max(totalSize, 32)}px` }}
        >
          {virtualItems.map((virtualRow) => {
            const sid = sortableIds[virtualRow.index];
            if (!sid) return null;
            const tid = parseTaskSortableId(sid);
            const task = tid != null ? taskMap.get(tid) : undefined;
            if (!task) return null;
            return (
              <div
                key={sid}
                data-index={virtualRow.index}
                ref={measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <StackedSortableTaskRowById
                  sid={sid}
                  containerId={containerId}
                  index={virtualRow.index}
                  task={task}
                  taskGroups={taskGroups}
                  taskPriorities={taskPriorities}
                  releases={releases}
                  viewMode={viewMode}
                  onComplete={onComplete}
                  onEdit={onEdit}
                  editingTitleTaskId={editingTitleTaskId}
                  editingTitleDraft={editingTitleDraft}
                  onTitleDraftChange={onTitleDraftChange}
                  onTitleCommit={onTitleCommit}
                  onTitleCancel={onTitleCancel}
                  titleEditBusy={titleEditBusy}
                  taskOverflowBoard={taskOverflowBoard}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {quickAddInsertIndex === 0 ? quickAddComposer : null}
          {sortableIds.map((sid, index) => {
            const tid = parseTaskSortableId(sid);
            const task = tid != null ? taskMap.get(tid) : undefined;
            if (!task) return null;
            return (
              <div key={sid} className="contents">
                <StackedSortableTaskRowById
                  sid={sid}
                  containerId={containerId}
                  index={index}
                  task={task}
                  taskGroups={taskGroups}
                  taskPriorities={taskPriorities}
                  releases={releases}
                  viewMode={viewMode}
                  onComplete={onComplete}
                  onEdit={onEdit}
                  editingTitleTaskId={editingTitleTaskId}
                  editingTitleDraft={editingTitleDraft}
                  onTitleDraftChange={onTitleDraftChange}
                  onTitleCommit={onTitleCommit}
                  onTitleCancel={onTitleCancel}
                  titleEditBusy={titleEditBusy}
                  taskOverflowBoard={taskOverflowBoard}
                />
                {quickAddInsertIndex === index + 1 ? quickAddComposer : null}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
});
