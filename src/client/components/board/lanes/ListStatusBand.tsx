import { memo, useMemo } from "react";
import {
  groupDisplayLabelForId,
  type List,
  type Task,
} from "../../../../shared/models";
import type { BoardBandSpreadProps } from "../boardColumnData";
import { useBoardFilterResolution } from "@/context/BoardFilterResolutionContext";
import {
  TaskCard,
  taskCardInlineEditFor,
  taskReleasePill,
} from "@/components/task/TaskCard";
import { TaskEditor } from "@/components/task/TaskEditor";
import {
  listStatusTasksSortedFromIndex,
  type BoardTaskFilterState,
} from "../boardStatusUtils";
import { SortableBandContent } from "./BandTaskList";
import { Composer } from "./Composer";
import { useBandController } from "./useBandController";

interface ListStatusBandProps extends BoardBandSpreadProps {
  list: List;
  status: string;
  /** Pre-indexed tasks by `listId:status`; built once per `board.tasks` ref (board perf plan #3). */
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
  /** When set, this band is a droppable sortable container. */
  containerId?: string;
  /** Ordered sortable task IDs from the DnD state. */
  sortableIds?: string[];
}

export const ListStatusBand = memo(function ListStatusBand({
  boardId,
  taskGroups,
  taskPriorities,
  releases,
  defaultTaskGroupId,
  defaultReleaseId,
  boardTasks,
  list,
  status,
  tasksByListStatus,
  containerId,
  sortableIds,
}: ListStatusBandProps) {
  // Single context read vs five store hooks per band (§2.4).
  const {
    activeGroupIds,
    activePriorityIds,
    activeReleaseIds,
    dateFilterResolved,
    taskCardViewMode,
  } = useBoardFilterResolution();

  const taskMap = useMemo(() => {
    const m = new Map<number, Task>();
    for (const t of boardTasks) m.set(t.taskId, t);
    return m;
  }, [boardTasks]);

  const taskFilter = useMemo<
    Pick<
      BoardTaskFilterState,
      | "activeGroupIds"
      | "activePriorityIds"
      | "activeReleaseIds"
      | "dateFilter"
    >
  >(
    () => ({
      activeGroupIds,
      activePriorityIds,
      activeReleaseIds,
      dateFilter: dateFilterResolved,
    }),
    [activeGroupIds, activePriorityIds, activeReleaseIds, dateFilterResolved],
  );

  const tasks = useMemo(() => {
    return listStatusTasksSortedFromIndex(
      tasksByListStatus,
      list.listId,
      status,
      taskFilter,
    );
  }, [tasksByListStatus, list.listId, status, taskFilter]);

  const ctrl = useBandController({
    boardId,
    list,
    status,
    boardTasks,
    taskGroups,
    defaultTaskGroupId,
    taskMap,
  });

  const taskEditor = (
    <TaskEditor
      board={{
        boardId,
        taskGroups,
        taskPriorities,
        releases,
        defaultTaskGroupId,
        defaultReleaseId,
      }}
      open={ctrl.editorOpen}
      onClose={ctrl.closeEditor}
      mode="edit"
      task={ctrl.resolvedEditTask ?? ctrl.editTaskResolved ?? undefined}
    />
  );

  const sortableBand = containerId != null && sortableIds != null ? (
    <SortableBandContent
      taskMap={taskMap}
      taskGroups={taskGroups}
      taskPriorities={taskPriorities}
      releases={releases}
      viewMode={taskCardViewMode}
      listId={list.listId}
      status={status}
      containerId={containerId}
      sortableIds={sortableIds}
      getScrollElement={ctrl.getScrollElement}
      onComplete={ctrl.handleComplete}
      onEdit={ctrl.handleEdit}
      editingTitleTaskId={ctrl.editingTitleTaskId}
      editingTitleDraft={ctrl.editingTitleDraft}
      onTitleDraftChange={ctrl.setEditingTitleDraft}
      onTitleCommit={() => void ctrl.commitInlineTitleEdit()}
      onTitleCancel={ctrl.cancelInlineTitleEdit}
      titleEditBusy={ctrl.titleEditBusy}
    />
  ) : null;

  const staticCards = sortableBand == null ? (
    <div className="flex flex-col gap-2">
      {tasks.map((task) => (
        <TaskCard
          key={task.taskId}
          task={task}
          taskPriorities={taskPriorities}
          viewMode={taskCardViewMode}
          groupLabel={groupDisplayLabelForId(taskGroups, task.groupId)}
          releasePill={taskReleasePill({ releases }, task)}
          onOpen={() => ctrl.openStaticEditor(task)}
          inlineEdit={taskCardInlineEditFor(
            task.taskId,
            ctrl.editingTitleTaskId,
            ctrl.editingTitleDraft,
            {
              setDraft: ctrl.setEditingTitleDraft,
              commit: () => void ctrl.commitInlineTitleEdit(),
              cancel: ctrl.cancelInlineTitleEdit,
              busy: ctrl.titleEditBusy,
            },
          )}
          onCompleteFromCircle={
            ctrl.isOpenBand
              ? (anchorEl) => ctrl.completeFromList(task, anchorEl)
              : undefined
          }
        />
      ))}
    </div>
  ) : null;

  const scrollContent = (
    <div
      ref={ctrl.scrollRef}
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-2"
      data-board-id={boardId}
      data-list-id={list.listId}
      data-status={status}
      aria-label={`${list.name} — ${status}`}
    >
      <div className="flex flex-col gap-2">
        {sortableBand ?? staticCards}

        {ctrl.isOpenBand && ctrl.adding && (
          <Composer
            title={ctrl.title}
            setTitle={ctrl.setTitle}
            inputRef={ctrl.inputRef}
            addCardRef={ctrl.addCardRef}
            isPending={ctrl.createIsPending}
            onSubmit={ctrl.submitCard}
            onCancel={ctrl.cancelAdd}
            onBlur={ctrl.handleTextareaBlur}
          />
        )}
      </div>
    </div>
  );

  if (ctrl.isOpenBand) {
    return (
      <>
        {scrollContent}
        {ctrl.showFab && <Composer.Fab onOpen={ctrl.openComposerAtBottom} />}
        {taskEditor}
      </>
    );
  }

  return (
    <>
      {scrollContent}
      {taskEditor}
    </>
  );
});
