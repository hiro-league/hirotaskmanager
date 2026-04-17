import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  groupDisplayLabelForId,
  listDisplayName,
  type List,
  type Task,
} from "../../../../shared/models";
import { useBoardFilterResolution } from "@/context/BoardFilterResolutionContext";
import { usePreferencesStore } from "@/store/preferences";
import {
  TaskCard,
  taskCardInlineEditFor,
  taskReleasePill,
} from "@/components/task/TaskCard";
import { Composer } from "@/components/board/lanes/Composer";
import { TaskEditor } from "@/components/task/TaskEditor";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { ListHeader } from "@/components/list/ListHeader";
import { ListStatsChipsRow } from "@/components/board/header/BoardStatsChips";
import { useBoardStatsDisplayOptional } from "@/components/board/BoardStatsContext";
import { cn } from "@/lib/utils";
import {
  boardListColumnOverlayShellClass,
  stackedListColumnMinHeightClass,
} from "../dnd/boardDragOverlayShell";
import { EMPTY_SORTABLE_IDS, parseTaskSortableId } from "../dnd/dndIds";
import type { BoardColumnSpreadProps } from "../boardColumnData";
import {
  type BoardTaskFilterState,
  listTasksMergedSortedFromIndex,
  visibleStatusesFromStored,
} from "../boardStatusUtils";
import { StackedSortableList } from "../lanes/StackedTaskList";
import { useStackedListTaskActions } from "../lanes/useStackedListTaskActions";
import { useBoardColumnSortableReact } from "../dnd/useBoardColumnSortableReact";
import { useColumnInViewport } from "../lanes/useColumnInViewport";
import { useStatusWorkflowOrder } from "@/api/queries";
import { subscribeWindowResize } from "@/lib/useWindowResize";

interface ListStackedBodyProps extends BoardColumnSpreadProps {
  list: List;
  listId: number;
  visibleStatuses: string[];
  workflowOrder: readonly string[];
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
  dragHandleRef?: React.RefCallback<HTMLElement>;
  sortableIds?: string[];
  taskContainerId?: string;
  forDragOverlay?: boolean;
}

function ListStackedBody({
  boardId,
  showStats,
  taskGroups,
  taskPriorities,
  releases,
  defaultTaskGroupId,
  defaultReleaseId,
  boardTasks,
  boardVisibleStatuses: _boardVisibleStatuses,
  list,
  listId,
  visibleStatuses,
  workflowOrder,
  tasksByListStatus,
  dragHandleRef,
  sortableIds = EMPTY_SORTABLE_IDS,
  taskContainerId,
  forDragOverlay = false,
}: ListStackedBodyProps) {
  void _boardVisibleStatuses;
  const {
    activeGroupIds,
    activePriorityIds,
    activeReleaseIds,
    dateFilterResolved,
    taskCardViewMode,
  } = useBoardFilterResolution();
  const headerCollapsed = usePreferencesStore((s) => s.boardFilterStripCollapsed);
  const boardStatsDisplay = useBoardStatsDisplayOptional();

  const taskMap = useMemo(() => {
    const m = new Map<number, Task>();
    for (const t of boardTasks) m.set(t.taskId, t);
    return m;
  }, [boardTasks]);

  const actions = useStackedListTaskActions({
    boardId,
    list,
    boardTasks,
    taskGroups,
    defaultTaskGroupId,
    workflowOrder,
    visibleStatuses,
    taskMap,
  });

  const outerRef = useRef<HTMLDivElement>(null);
  const [bodyMaxHeight, setBodyMaxHeight] = useState<number | null>(null);

  const taskFilter = useMemo<BoardTaskFilterState>(
    () => ({
      visibleStatuses,
      workflowOrder,
      activeGroupIds,
      activePriorityIds,
      activeReleaseIds,
      dateFilter: dateFilterResolved,
    }),
    [visibleStatuses, workflowOrder, activeGroupIds, activePriorityIds, activeReleaseIds, dateFilterResolved],
  );

  const staticTasks = useMemo(
    () =>
      taskContainerId != null
        ? null
        : listTasksMergedSortedFromIndex(tasksByListStatus, listId, taskFilter),
    [taskContainerId, tasksByListStatus, listId, taskFilter],
  );

  const showFab = actions.canAddOpen && !actions.adding && !forDragOverlay;
  const sortableQuickAddInsertIndex = useMemo(() => {
    if (taskContainerId == null) return null;
    let index = 0;
    while (index < sortableIds.length) {
      const taskId = parseTaskSortableId(sortableIds[index] ?? "");
      const task = taskId != null ? taskMap.get(taskId) : undefined;
      if (!task || task.status !== actions.quickAddStatus) break;
      index += 1;
    }
    return index;
  }, [taskContainerId, sortableIds, taskMap, actions.quickAddStatus]);
  const staticQuickAddInsertIndex = useMemo(() => {
    if (staticTasks == null) return null;
    const firstNonQuickAddIndex = staticTasks.findIndex(
      (task) => task.status !== actions.quickAddStatus,
    );
    return firstNonQuickAddIndex >= 0 ? firstNonQuickAddIndex : staticTasks.length;
  }, [staticTasks, actions.quickAddStatus]);

  const quickAddComposer =
    actions.canAddOpen && actions.adding ? (
      <Composer
        title={actions.title}
        setTitle={actions.setTitle}
        inputRef={actions.inputRef}
        addCardRef={actions.addCardRef}
        isPending={actions.createIsPending}
        onSubmit={() => actions.submitTask()}
        onCancel={actions.cancelAdd}
        onBlur={actions.handleTextareaBlur}
      />
    ) : null;

  const hasListStatsRow =
    !forDragOverlay &&
    showStats &&
    boardStatsDisplay != null &&
    !boardStatsDisplay.statsError;

  useLayoutEffect(() => {
    if (forDragOverlay) {
      setBodyMaxHeight(null);
      return;
    }

    const updateBodyMaxHeight = () => {
      if (typeof window === "undefined") return;
      const el = outerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const bottomGap = 32;
      const next = Math.max(240, Math.floor(window.innerHeight - top - bottomGap));
      setBodyMaxHeight(next);
    };

    updateBodyMaxHeight();
    const unsubResize = subscribeWindowResize(updateBodyMaxHeight);
    return () => {
      unsubResize();
    };
  }, [forDragOverlay, headerCollapsed, hasListStatsRow]);

  const outerClass = cn(
    "relative flex flex-col overflow-hidden bg-muted/20",
    forDragOverlay && "min-h-0 flex-1",
  );

  const outerStyle =
    !forDragOverlay && bodyMaxHeight != null
      ? { maxHeight: `${bodyMaxHeight}px` }
      : undefined;

  const listStatsRow = hasListStatsRow ? (
    <ListStatsChipsRow
      stats={boardStatsDisplay.listStat(listId)}
      showSpinner={boardStatsDisplay.showChipSpinner}
      entryToken={boardStatsDisplay.entryToken}
    />
  ) : null;

  const main = (
    <>
      <ListHeader
        boardId={boardId}
        list={list}
        dragHandleRef={dragHandleRef}
      />
      {listStatsRow}
      <div ref={outerRef} className={outerClass} style={outerStyle}>
        <div
          ref={actions.scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-4 pt-2"
          data-board-id={boardId}
          data-list-id={listId}
          aria-label={`${listDisplayName(list)} — tasks`}
        >
          <div className="flex flex-col gap-2">
            {taskContainerId != null ? (
              <StackedSortableList
                taskMap={taskMap}
                taskGroups={taskGroups}
                taskPriorities={taskPriorities}
                releases={releases}
                viewMode={taskCardViewMode}
                listId={listId}
                containerId={taskContainerId}
                sortableIds={sortableIds}
                onComplete={actions.handleComplete}
                onEdit={actions.handleEdit}
                editingTitleTaskId={actions.editingTitleTaskId}
                editingTitleDraft={actions.editingTitleDraft}
                onTitleDraftChange={actions.setEditingTitleDraft}
                onTitleCommit={() => void actions.commitInlineTitleEdit()}
                onTitleCancel={actions.cancelInlineTitleEdit}
                titleEditBusy={actions.titleEditBusy}
                quickAddInsertIndex={sortableQuickAddInsertIndex}
                quickAddComposer={quickAddComposer}
                getScrollElement={actions.getScrollElement}
                enableVirtualization={!forDragOverlay && !actions.adding}
              />
            ) : (
              <>
                {staticQuickAddInsertIndex === 0 ? quickAddComposer : null}
                {staticTasks?.map((task, index) => (
                  <div key={task.taskId} className="contents">
                    <TaskCard
                      task={task}
                      taskPriorities={taskPriorities}
                      viewMode={taskCardViewMode}
                      groupLabel={groupDisplayLabelForId(taskGroups, task.groupId)}
                      releasePill={taskReleasePill({ releases }, task)}
                      onOpen={() => actions.openStaticEditor(task)}
                      inlineEdit={taskCardInlineEditFor(
                        task.taskId,
                        actions.editingTitleTaskId,
                        actions.editingTitleDraft,
                        {
                          setDraft: actions.setEditingTitleDraft,
                          commit: () => void actions.commitInlineTitleEdit(),
                          cancel: actions.cancelInlineTitleEdit,
                          busy: actions.titleEditBusy,
                        },
                      )}
                    />
                    {staticQuickAddInsertIndex === index + 1 ? quickAddComposer : null}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {showFab && (
          <Composer.Fab onOpen={actions.openComposerAtQuickAddPosition} />
        )}
      </div>
    </>
  );

  if (forDragOverlay) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {main}
      </div>
    );
  }

  return (
    <>
      {main}
      <TaskEditor
        board={{
          boardId,
          taskGroups,
          taskPriorities,
          releases,
          defaultTaskGroupId,
          defaultReleaseId,
        }}
        open={actions.editorOpen}
        onClose={actions.closeEditor}
        mode="edit"
        task={actions.resolvedEditTask ?? actions.editTaskResolved ?? undefined}
      />
    </>
  );
}

export interface BoardListStackedColumnOverlayProps
  extends BoardColumnSpreadProps {
  list: List;
  listId: number;
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
  visibleStatuses: string[];
}

export function BoardListStackedColumnOverlay({
  list,
  listId,
  tasksByListStatus,
  visibleStatuses,
  ...columnSpread
}: BoardListStackedColumnOverlayProps) {
  const workflowOrder = useStatusWorkflowOrder();
  return (
    <div className={boardListColumnOverlayShellClass}>
      <ListStackedBody
        {...columnSpread}
        list={list}
        listId={listId}
        visibleStatuses={visibleStatuses}
        workflowOrder={workflowOrder}
        tasksByListStatus={tasksByListStatus}
        forDragOverlay
      />
    </div>
  );
}

interface BoardListStackedColumnProps extends BoardColumnSpreadProps {
  list: List;
  listId: number;
  listIndex: number;
  taskContainerId?: string;
  sortableIds?: string[];
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
}

export const BoardListStackedColumn = memo(function BoardListStackedColumn({
  list,
  listId,
  listIndex,
  taskContainerId,
  sortableIds,
  tasksByListStatus,
  boardId,
  showStats,
  taskGroups,
  taskPriorities,
  releases,
  defaultTaskGroupId,
  defaultReleaseId,
  boardTasks,
  boardVisibleStatuses,
}: BoardListStackedColumnProps) {
  const workflowOrder = useStatusWorkflowOrder();
  const visibleStatuses = useMemo(
    () => visibleStatusesFromStored(boardVisibleStatuses, workflowOrder),
    [boardVisibleStatuses, workflowOrder],
  );

  const { ref, handleRef, isDragging } = useBoardColumnSortableReact(
    listId,
    listIndex,
  );

  const { columnRef: viewportRef, inViewport } = useColumnInViewport(!isDragging);

  const boardNav = useBoardKeyboardNavOptional();
  const listColumnShellRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!boardNav) return;
    const el = listColumnShellRef.current;
    boardNav.registerListElement(list.listId, el);
    return () => boardNav.registerListElement(list.listId, null);
  }, [boardNav, list]);

  const mergedOuterRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref(node);
      (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref, viewportRef],
  );

  return (
    <div
      ref={mergedOuterRef}
      className={cn(
        "relative flex w-72 shrink-0 flex-col self-start",
        isDragging && stackedListColumnMinHeightClass,
      )}
      data-list-column={list.listId}
      data-board-no-pan
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || isDragging || !boardNav) return;
        boardNav.setHoveredListId(list.listId);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse" || !boardNav) return;
        boardNav.setHoveredListId(null);
      }}
    >
      <div
        ref={listColumnShellRef}
        className={cn(
          "group/list-col flex flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
          isDragging
            ? "min-h-0 flex-1 border-2 border-dashed border-primary/20 bg-muted/30 shadow-none"
            : "border-border",
        )}
        onPointerDown={(e) => {
          if (!boardNav || isDragging) return;
          const target = e.target;
          if (!(target instanceof Element)) return;
          if (target.closest("[data-task-card-root],button,input,textarea,[role=menu],[role=menuitem]")) {
            return;
          }
          boardNav.selectList(list.listId);
        }}
      >
        {!isDragging && inViewport && (
          <ListStackedBody
            boardId={boardId}
            showStats={showStats}
            taskGroups={taskGroups}
            taskPriorities={taskPriorities}
            releases={releases}
            defaultTaskGroupId={defaultTaskGroupId}
            defaultReleaseId={defaultReleaseId}
            boardTasks={boardTasks}
            boardVisibleStatuses={boardVisibleStatuses}
            list={list}
            listId={listId}
            visibleStatuses={visibleStatuses}
            workflowOrder={workflowOrder}
            tasksByListStatus={tasksByListStatus}
            dragHandleRef={handleRef}
            taskContainerId={taskContainerId}
            sortableIds={sortableIds}
          />
        )}
        {!isDragging && !inViewport && (
          <ListHeader
            boardId={boardId}
            list={list}
            dragHandleRef={handleRef}
          />
        )}
      </div>
    </div>
  );
});
