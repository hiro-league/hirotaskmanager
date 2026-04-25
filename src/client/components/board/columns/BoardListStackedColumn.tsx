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
import { boardListColumnOverlayShellClass } from "../dnd/boardDragOverlayShell";
import { EMPTY_SORTABLE_IDS, parseTaskSortableId } from "../dnd/dndIds";
import type {
  BoardColumnSpreadProps,
  TaskCardOverflowBoardData,
} from "../boardColumnData";
import {
  type BoardTaskFilterState,
  listTasksMergedSortedFromIndex,
  visibleStatusesFromStored,
} from "../boardStatusUtils";
import { StackedSortableList } from "../lanes/StackedTaskList";
import { useStackedListTaskActions } from "../lanes/useStackedListTaskActions";
import { useBoardColumnSortableReact } from "../dnd/useBoardColumnSortableReact";
import { useColumnInViewport } from "../lanes/useColumnInViewport";
import { isOptimisticListId } from "@/api/mutations/shared";
import { useStatusWorkflowOrder } from "@/api/queries";
import { subscribeWindowResize } from "@/lib/useWindowResize";
import { ListColumnCreatingOverlay } from "./ListColumnCreatingOverlay";

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
  boardSlug,
  showStats,
  taskGroups,
  taskPriorities,
  releases,
  defaultTaskGroupId,
  defaultReleaseId,
  boardLists,
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

  const taskOverflowBoard = useMemo<TaskCardOverflowBoardData>(
    () => ({
      boardId,
      boardSlug,
      taskGroups,
      taskPriorities,
      releases,
      defaultTaskGroupId,
      defaultReleaseId,
      lists: boardLists,
      tasks: boardTasks,
    }),
    [
      boardId,
      boardSlug,
      taskGroups,
      taskPriorities,
      releases,
      defaultTaskGroupId,
      defaultReleaseId,
      boardLists,
      boardTasks,
    ],
  );

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
                taskOverflowBoard={taskOverflowBoard}
              />
            ) : (
              <>
                {staticQuickAddInsertIndex === 0 && quickAddComposer != null ? (
                  <div key="__quickadd-slot" className="contents">
                    {quickAddComposer}
                  </div>
                ) : null}
                {staticTasks?.flatMap((task, index) => {
                  const row = (
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
                        overflowActionsBoard={taskOverflowBoard}
                      />
                    </div>
                  );
                  const slot =
                    quickAddComposer != null ? (
                      <div key="__quickadd-slot" className="contents">
                        {quickAddComposer}
                      </div>
                    ) : null;
                  if (staticQuickAddInsertIndex === index + 1 && slot) {
                    return [row, slot];
                  }
                  return [row];
                })}
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
          boardSlug,
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
  boardSlug,
  showStats,
  taskGroups,
  taskPriorities,
  releases,
  defaultTaskGroupId,
  defaultReleaseId,
  boardLists,
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
  const outerColumnRef = useRef<HTMLDivElement | null>(null);
  // Task #31336: stacked columns are content-sized (`self-start`); when drag starts
  // the body unmounts in the same render, so a layout-effect measurement at that
  // point reads the already-collapsed shell. Track the pre-drag height
  // continuously while not dragging via ResizeObserver (kept in a ref to avoid
  // re-renders), then promote the last-known value to inline `style.height` on
  // the drag-start transition so the placeholder keeps its visible size.
  const lastIdleHeightRef = useRef<number | null>(null);
  const [frozenDragHeight, setFrozenDragHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!boardNav) return;
    const el = listColumnShellRef.current;
    boardNav.registerListElement(list.listId, el);
    return () => boardNav.registerListElement(list.listId, null);
  }, [boardNav, list]);

  useLayoutEffect(() => {
    if (isDragging) {
      const measured = lastIdleHeightRef.current;
      if (measured != null && measured > 0) setFrozenDragHeight(measured);
      return;
    }
    setFrozenDragHeight(null);
    const el = outerColumnRef.current;
    if (!el) return;
    const snapshot = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) lastIdleHeightRef.current = h;
    };
    snapshot();
    const ro = new ResizeObserver(snapshot);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDragging]);

  const mergedOuterRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref(node);
      outerColumnRef.current = node;
      (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref, viewportRef],
  );

  const listIsOptimistic = isOptimisticListId(listId);

  return (
    <div
      ref={mergedOuterRef}
      className="relative flex w-72 shrink-0 flex-col self-start"
      style={
        isDragging && frozenDragHeight != null
          ? { height: `${frozenDragHeight}px` }
          : undefined
      }
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
        aria-busy={listIsOptimistic}
        className={cn(
          "group/list-col relative flex flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
          isDragging
            ? "min-h-0 flex-1 border-2 border-dashed border-primary/20 bg-muted/30 shadow-none"
            : "border-border",
          listIsOptimistic && "opacity-70",
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
        <ListColumnCreatingOverlay show={listIsOptimistic} />
        {!isDragging && inViewport && (
          <ListStackedBody
            boardId={boardId}
            boardSlug={boardSlug}
            showStats={showStats}
            taskGroups={taskGroups}
            taskPriorities={taskPriorities}
            releases={releases}
            defaultTaskGroupId={defaultTaskGroupId}
            defaultReleaseId={defaultReleaseId}
            boardLists={boardLists}
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
