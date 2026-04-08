import { Plus, X } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from "react";
import {
  effectiveDefaultTaskGroupId,
  groupDisplayLabelForId,
  listDisplayName,
  type Board,
  type List,
  type Task,
} from "../../../shared/models";
import { useCreateTask, useUpdateTask } from "@/api/mutations";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { TaskCard, taskReleasePill } from "@/components/task/TaskCard";
import { TaskEditor } from "@/components/task/TaskEditor";
import { useBoardTaskKeyboardBridge } from "@/components/board/shortcuts/BoardTaskKeyboardBridge";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { ListHeader } from "@/components/list/ListHeader";
import {
  type TaskCardViewMode,
  usePreferencesStore,
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskCardViewMode,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import { ListStatsChipsRow } from "@/components/board/BoardStatsChips";
import { useBoardStatsDisplayOptional } from "@/components/board/BoardStatsContext";
import { cn } from "@/lib/utils";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";
import {
  boardListColumnOverlayShellClass,
  stackedListColumnMinHeightClass,
} from "./boardDragOverlayShell";
import { parseTaskSortableId } from "./dndIds";
import {
  type BoardTaskFilterState,
  listTasksMergedSorted,
  visibleStatusesForBoard,
} from "./boardStatusUtils";
import { SortableTaskRow } from "./SortableTaskRow";
import { useBoardColumnSortableReact } from "./useBoardColumnSortableReact";
import { useBoardTaskContainerDroppableReact } from "./useBoardTaskContainerDroppableReact";

interface ListStackedBodyProps {
  board: Board;
  list: List;
  listId: number;
  visibleStatuses: string[];
  workflowOrder: readonly string[];
  dragHandleRef?: RefCallback<HTMLElement>;
  sortableIds?: string[];
  /** Container id for this list's task droppable. */
  taskContainerId?: string;
  /** List-column DragOverlay clone: fill shell height like lanes (flex-1 body). */
  forDragOverlay?: boolean;
}

const EMPTY_SORTABLE_IDS: string[] = [];

/** Per-row component that derives stable callbacks from task id */
const StackedSortableTaskRowById = memo(function StackedSortableTaskRowById({
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
  editingTitle,
  titleDraft,
  onTitleDraftChange,
  onTitleCommit,
  onTitleCancel,
  titleEditBusy,
}: {
  sid: string;
  containerId: string;
  index: number;
  task: Task;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  releases: Board["releases"];
  viewMode: TaskCardViewMode;
  onComplete: (taskId: number, anchorEl?: HTMLElement) => void;
  onEdit: (taskId: number) => void;
  editingTitle: boolean;
  titleDraft?: string;
  onTitleDraftChange: (value: string) => void;
  onTitleCommit: () => void;
  onTitleCancel: () => void;
  titleEditBusy: boolean;
}) {
  const handleOpen = useCallback(() => onEdit(task.id), [onEdit, task.id]);
  const handleCompleteFromCircle = useCallback(
    (anchorEl: HTMLElement) => onComplete(task.id, anchorEl),
    [onComplete, task.id],
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
      editingTitle={editingTitle}
      titleDraft={titleDraft}
      onTitleDraftChange={onTitleDraftChange}
      onTitleCommit={onTitleCommit}
      onTitleCancel={onTitleCancel}
      titleEditBusy={titleEditBusy}
      onCompleteFromCircle={
        task.status === "open" ? handleCompleteFromCircle : undefined
      }
    />
  );
});

// Memoized to prevent re-rendering the entire list on unrelated drag-over events
const StackedSortableList = memo(function StackedSortableList({
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
}: {
  taskMap: Map<number, Task>;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  releases: Board["releases"];
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
}) {
  const { ref, isDropTarget } = useBoardTaskContainerDroppableReact({
    containerId,
    layout: "stacked",
    listId,
  });

  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-8 flex-col gap-2 rounded-md",
        isDropTarget && "bg-primary/[0.07] ring-1 ring-primary/15",
      )}
    >
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
              editingTitle={editingTitleTaskId === task.id}
              titleDraft={editingTitleTaskId === task.id ? editingTitleDraft : undefined}
              onTitleDraftChange={onTitleDraftChange}
              onTitleCommit={onTitleCommit}
              onTitleCancel={onTitleCancel}
              titleEditBusy={titleEditBusy}
            />
            {quickAddInsertIndex === index + 1 ? quickAddComposer : null}
          </div>
        );
      })}
    </div>
  );
});

function ListStackedBody({
  board,
  list,
  listId,
  visibleStatuses,
  workflowOrder,
  dragHandleRef,
  sortableIds = EMPTY_SORTABLE_IDS,
  taskContainerId,
  forDragOverlay = false,
}: ListStackedBodyProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: statuses } = useStatuses();
  const activeGroupIds = useResolvedActiveTaskGroupIds(board.id, board.taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.id,
    board.taskPriorities,
  );
  const activeReleaseIds = useResolvedActiveReleaseIds(board.id, board.releases);
  const dateFilterResolved = useResolvedTaskDateFilter(board.id);
  const taskCardViewMode = useResolvedTaskCardViewMode(board.id);
  const headerCollapsed = usePreferencesStore((s) => s.boardFilterStripCollapsed);
  const boardStatsDisplay = useBoardStatsDisplayOptional();
  const stackedBoardNav = useBoardKeyboardNavOptional();
  const completion = useBoardTaskCompletionCelebrationOptional();

  // O(1) task lookup map
  const taskMap = useMemo(() => {
    const m = new Map<number, Task>();
    for (const t of board.tasks) m.set(t.id, t);
    return m;
  }, [board.tasks]);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const createPendingRef = useRef(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTitleTaskId, setEditingTitleTaskId] = useState<number | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState("");
  const [bodyMaxHeight, setBodyMaxHeight] = useState<number | null>(null);
  createPendingRef.current = createTask.isPending;

  const resolvedEditTask =
    editingTask !== null
      ? (taskMap.get(editingTask.id) ?? editingTask)
      : null;
  const editTaskResolved = editingTaskId != null ? (taskMap.get(editingTaskId) ?? null) : null;

  // Stable callback refs for use inside memoized children
  const boardRef = useRef(board);
  boardRef.current = board;
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const handleComplete = useCallback(
    (taskId: number, anchorEl?: HTMLElement) => {
      const t = boardRef.current.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const closedId =
        statusesRef.current?.find((s) => s.isClosed)?.id ?? "closed";
      const now = new Date().toISOString();
      completion?.celebrateTaskCompletion({ taskId, anchorEl });
      updateTask.mutate({
        boardId: boardRef.current.id,
        task: {
          ...t,
          status: closedId,
          updatedAt: now,
          closedAt: t.closedAt ?? now,
        },
      });
    },
    [completion, updateTask],
  );

  const handleEdit = useCallback((taskId: number) => {
    // Task-open flows should reuse the shared board selection state so canceling
    // the editor leaves the last-opened task current.
    stackedBoardNav?.selectTask(taskId);
    setEditingTaskId(taskId);
  }, [stackedBoardNav]);

  const cancelInlineTitleEdit = useCallback(() => {
    setEditingTitleTaskId(null);
    setEditingTitleDraft("");
  }, []);

  const startInlineTitleEdit = useCallback(
    (taskId: number) => {
      const taskToEdit = boardRef.current.tasks.find((entry) => entry.id === taskId);
      if (!taskToEdit || taskToEdit.listId !== list.id) return false;
      // F2 keeps the task card in place and only swaps its title into edit mode.
      setEditingTask(null);
      setEditingTaskId(null);
      setEditingTitleTaskId(taskId);
      setEditingTitleDraft(taskToEdit.title);
      return true;
    },
    [list.id],
  );

  const commitInlineTitleEdit = useCallback(async () => {
    const taskId = editingTitleTaskId;
    if (taskId == null) return;
    const taskToEdit = boardRef.current.tasks.find((entry) => entry.id === taskId);
    cancelInlineTitleEdit();
    if (!taskToEdit) return;
    const nextTitle = editingTitleDraft.trim() || "Untitled";
    if (nextTitle === taskToEdit.title) return;
    await updateTask.mutateAsync({
      boardId: boardRef.current.id,
      task: {
        ...taskToEdit,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
      },
    });
  }, [cancelInlineTitleEdit, editingTitleDraft, editingTitleTaskId, updateTask]);

  const { registerOpenTaskEditor, registerEditTaskTitle } = useBoardTaskKeyboardBridge();
  useEffect(() => {
    return registerOpenTaskEditor((taskId) => {
      const t = board.tasks.find((x) => x.id === taskId);
      if (!t || t.listId !== list.id) return false;
      cancelInlineTitleEdit();
      stackedBoardNav?.selectTask(taskId);
      setEditingTaskId(taskId);
      return true;
    });
  }, [board.tasks, cancelInlineTitleEdit, list.id, registerOpenTaskEditor, stackedBoardNav]);

  useEffect(() => {
    return registerEditTaskTitle((taskId) => startInlineTitleEdit(taskId));
  }, [registerEditTaskTitle, startInlineTitleEdit]);

  const cancelAdd = () => {
    setAdding(false);
    setTitle("");
  };

  const scrollComposerIntoView = useCallback(() => {
    const scrollEl = scrollRef.current;
    const addCardEl = addCardRef.current;
    if (!scrollEl || !addCardEl) {
      inputRef.current?.focus();
      return;
    }
    const margin = 8;
    const scrollRect = scrollEl.getBoundingClientRect();
    const cardRect = addCardEl.getBoundingClientRect();
    // Stacked lists mix multiple statuses in one scroller, so keep the quick-add
    // editor aligned with the end of the open block instead of jumping to list bottom.
    if (cardRect.top < scrollRect.top + margin) {
      scrollEl.scrollTop += cardRect.top - scrollRect.top - margin;
    } else if (cardRect.bottom > scrollRect.bottom - margin) {
      scrollEl.scrollTop += cardRect.bottom - scrollRect.bottom + margin;
    }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!adding) return;
    const raf1 = window.requestAnimationFrame(() => {
      scrollComposerIntoView();
      window.requestAnimationFrame(scrollComposerIntoView);
    });
    return () => window.cancelAnimationFrame(raf1);
  }, [adding, scrollComposerIntoView]);

  const openComposerAtQuickAddPosition = () => {
    if (adding) {
      scrollComposerIntoView();
      return;
    }
    setAdding(true);
  };

  const focusComposerAtQuickAddPosition = () => {
    window.requestAnimationFrame(() => {
      scrollComposerIntoView();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    });
  };

  const submitTask = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const existingTaskIds = new Set(boardRef.current.tasks.map((task) => task.id));
    // New tasks always start in the board default group, even when filters are narrowed.
    const defaultGroupId = effectiveDefaultTaskGroupId(board);
    createTask.mutate(
      {
        boardId: board.id,
        listId: list.id,
        status: quickAddStatus,
        title: trimmed,
        body: "",
        groupId: defaultGroupId,
      },
      {
        onSuccess: (data) => {
          setTitle("");
          const createdTask =
            !existingTaskIds.has(data.entity.id) &&
            data.entity.listId === list.id &&
            data.entity.status === quickAddStatus
              ? data.entity
              : null;
          // After creating a task, move selection to the new task instead of
          // leaving the highlight behind on an older interaction.
          if (createdTask) stackedBoardNav?.selectTask(createdTask.id);
          focusComposerAtQuickAddPosition();
        },
      },
    );
  };

  const handleTextareaBlur = () => {
    window.setTimeout(() => {
      if (createPendingRef.current) return;
      const active = document.activeElement;
      if (
        addCardRef.current &&
        active instanceof Node &&
        addCardRef.current.contains(active)
      ) {
        return;
      }
      cancelAdd();
    }, 0);
  };

  const quickAddStatus =
    workflowOrder.includes("open") ? "open" : (workflowOrder[0] ?? "open");
  const canAddOpen = visibleStatuses.includes(quickAddStatus);

  const taskFilter = useMemo<BoardTaskFilterState>(
    () => ({
      // Reuse the same normalized board filter shape as other board consumers.
      visibleStatuses,
      workflowOrder,
      activeGroupIds,
      activePriorityIds,
      activeReleaseIds,
      dateFilter: dateFilterResolved,
    }),
    [
      visibleStatuses,
      workflowOrder,
      activeGroupIds,
      activePriorityIds,
      activeReleaseIds,
      dateFilterResolved,
    ],
  );

  const openComposerAtQuickAddPositionRef = useRef(openComposerAtQuickAddPosition);
  openComposerAtQuickAddPositionRef.current = openComposerAtQuickAddPosition;
  useEffect(() => {
    // Stacked layout: register add-task composer for keyboard "t" (lanes use ListStatusBand).
    if (!canAddOpen) return;
    if (!stackedBoardNav) return;
    return stackedBoardNav.registerAddTaskComposer(list.id, () => {
      openComposerAtQuickAddPositionRef.current();
    });
  }, [canAddOpen, list.id, stackedBoardNav]);

  const staticTasks = useMemo(
    () =>
      taskContainerId != null
        ? null
        : listTasksMergedSorted(board, listId, taskFilter),
    [
      taskContainerId,
      board,
      listId,
      taskFilter,
    ],
  );

  // Stacked lists now mirror lanes: use only the hover FAB so short columns
  // still expose add-task from the bottom-right corner without an inline button.
  const showFab = canAddOpen && !adding && !forDragOverlay;
  const sortableQuickAddInsertIndex = useMemo(() => {
    if (taskContainerId == null) return null;
    let index = 0;
    while (index < sortableIds.length) {
      const taskId = parseTaskSortableId(sortableIds[index] ?? "");
      const task = taskId != null ? taskMap.get(taskId) : undefined;
      if (!task || task.status !== quickAddStatus) break;
      index += 1;
    }
    return index;
  }, [taskContainerId, sortableIds, taskMap, quickAddStatus]);
  const staticQuickAddInsertIndex = useMemo(() => {
    if (staticTasks == null) return null;
    const firstNonQuickAddIndex = staticTasks.findIndex(
      (task) => task.status !== quickAddStatus,
    );
    return firstNonQuickAddIndex >= 0 ? firstNonQuickAddIndex : staticTasks.length;
  }, [staticTasks, quickAddStatus]);

  const quickAddComposer =
    canAddOpen && adding ? (
      <div
        ref={addCardRef}
        className="mt-2 shrink-0 rounded-md border border-border bg-background p-2 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* This composer intentionally restores selection inside the board's non-selectable drag surface. */}
        <textarea
          ref={inputRef}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground select-text"
          placeholder="Enter a title or paste a link"
          value={title}
          disabled={createTask.isPending}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTextareaBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitTask();
            }
            if (e.key === "Escape") cancelAdd();
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={createTask.isPending || !title.trim()}
            onClick={() => submitTask()}
          >
            Add task
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cancel"
            disabled={createTask.isPending}
            onClick={cancelAdd}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    ) : null;

  const hasListStatsRow =
    !forDragOverlay &&
    board.showStats &&
    boardStatsDisplay != null &&
    !boardStatsDisplay.statsError;

  useEffect(() => {
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
    const rafId = window.requestAnimationFrame(updateBodyMaxHeight);
    window.addEventListener("resize", updateBodyMaxHeight);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateBodyMaxHeight);
    };
  }, [
    forDragOverlay,
    headerCollapsed,
    // Keep long stacked lists pinned to the viewport when the optional stats row
    // appears or disappears, just like the board header collapse/expand recalc.
    hasListStatsRow,
  ]);

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
        boardId={board.id}
        list={list}
        dragHandleRef={dragHandleRef}
      />
      {listStatsRow}
      <div ref={outerRef} className={outerClass} style={outerStyle}>
        {/* Scroll container — FAB lives outside this div so it never scrolls */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-4 pt-2"
          data-board-id={board.id}
          data-list-id={listId}
          aria-label={`${listDisplayName(list)} — tasks`}
        >
          <div className="flex flex-col gap-2">
            {taskContainerId != null ? (
              <StackedSortableList
                taskMap={taskMap}
                taskGroups={board.taskGroups}
                taskPriorities={board.taskPriorities}
                releases={board.releases}
                viewMode={taskCardViewMode}
                listId={listId}
                containerId={taskContainerId}
                sortableIds={sortableIds}
                onComplete={handleComplete}
                onEdit={handleEdit}
                editingTitleTaskId={editingTitleTaskId}
                editingTitleDraft={editingTitleDraft}
                onTitleDraftChange={setEditingTitleDraft}
                onTitleCommit={() => void commitInlineTitleEdit()}
                onTitleCancel={cancelInlineTitleEdit}
                titleEditBusy={updateTask.isPending}
                quickAddInsertIndex={sortableQuickAddInsertIndex}
                quickAddComposer={quickAddComposer}
              />
            ) : (
              <>
                {staticQuickAddInsertIndex === 0 ? quickAddComposer : null}
                {staticTasks?.map((task, index) => (
                  <div key={task.id} className="contents">
                    <TaskCard
                      task={task}
                      taskPriorities={board.taskPriorities}
                      viewMode={taskCardViewMode}
                      groupLabel={groupDisplayLabelForId(board.taskGroups, task.groupId)}
                      releasePill={taskReleasePill(board, task)}
                      onOpen={() => setEditingTask(task)}
                      editingTitle={editingTitleTaskId === task.id}
                      titleDraft={editingTitleTaskId === task.id ? editingTitleDraft : undefined}
                      onTitleDraftChange={setEditingTitleDraft}
                      onTitleCommit={() => void commitInlineTitleEdit()}
                      onTitleCancel={cancelInlineTitleEdit}
                      titleEditBusy={updateTask.isPending}
                    />
                    {staticQuickAddInsertIndex === index + 1 ? quickAddComposer : null}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* FAB — sibling of scroll div, anchored to outer shell, never scrolls */}
        {showFab && (
          <button
            type="button"
            aria-label="Add task"
            className={cn(
              "absolute bottom-3 right-3 z-10",
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-md ring-1 ring-border/60",
              // Match lanes: keep the FAB hidden until this stacked list is hovered.
              "opacity-0 pointer-events-none transition-opacity duration-150",
              "group-hover/list-col:opacity-100 group-hover/list-col:pointer-events-auto",
              "hover:opacity-90",
              "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            onClick={(e) => {
              e.stopPropagation();
              openComposerAtQuickAddPosition();
            }}
          >
            <Plus className="size-6" strokeWidth={2.5} aria-hidden />
          </button>
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
        board={board}
        open={editingTask !== null || editingTaskId !== null}
        onClose={() => { setEditingTask(null); setEditingTaskId(null); }}
        mode="edit"
        task={resolvedEditTask ?? editTaskResolved ?? undefined}
      />
    </>
  );
}

export interface BoardListStackedColumnOverlayProps {
  board: Board;
  listId: number;
}

export function BoardListStackedColumnOverlay({
  board,
  listId,
}: BoardListStackedColumnOverlayProps) {
  const workflowOrder = useStatusWorkflowOrder();
  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;
  const visibleStatuses = visibleStatusesForBoard(board, workflowOrder);
  return (
    <div className={boardListColumnOverlayShellClass}>
      <ListStackedBody
        board={board}
        list={list}
        listId={listId}
        visibleStatuses={visibleStatuses}
        workflowOrder={workflowOrder}
        forDragOverlay
      />
    </div>
  );
}

interface BoardListStackedColumnProps {
  board: Board;
  listId: number;
  listIndex: number;
  taskContainerId?: string;
  sortableIds?: string[];
}

// Memoized: only re-renders when this column's props actually change
export const BoardListStackedColumn = memo(function BoardListStackedColumn({
  board,
  listId,
  listIndex,
  taskContainerId,
  sortableIds,
}: BoardListStackedColumnProps) {
  const workflowOrder = useStatusWorkflowOrder();
  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board, workflowOrder),
    [board, workflowOrder],
  );

  const { ref, handleRef, isDragging } = useBoardColumnSortableReact(
    listId,
    listIndex,
  );

  const boardNav = useBoardKeyboardNavOptional();
  const listColumnShellRef = useRef<HTMLDivElement | null>(null);
  const list = board.lists.find((l) => l.id === listId);
  const listKeyboardHighlight =
    list != null &&
    !isDragging &&
    boardNav?.highlightedListId === list.id;

  useLayoutEffect(() => {
    if (!boardNav || list == null) return;
    const el = listColumnShellRef.current;
    boardNav.registerListElement(list.id, el);
    return () => boardNav.registerListElement(list.id, null);
  }, [boardNav, list]);

  if (!list) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex w-72 shrink-0 flex-col self-start",
        isDragging && stackedListColumnMinHeightClass,
      )}
      data-list-column={list.id}
      data-board-no-pan
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || isDragging || !boardNav) return;
        // Remember the hovered list so Tab can select the list when the
        // pointer is over empty column space instead of a specific task card.
        boardNav.setHoveredListId(list.id);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse" || !boardNav) return;
        boardNav.setHoveredListId(null);
      }}
    >
      <div
        ref={listColumnShellRef}
        className={cn(
          // Mirror lane columns so hover-only controls stay scoped to the active list.
          "group/list-col flex flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
          isDragging
            ? "min-h-0 flex-1 border-2 border-dashed border-primary/20 bg-muted/30 shadow-none"
            : "border-border",
          // Full-column shell so the ring wraps the list title and body together.
          listKeyboardHighlight &&
            "ring-2 ring-offset-2 ring-offset-background shadow-md [--tw-ring-color:var(--board-selection-ring)]",
        )}
        onPointerDown={(e) => {
          if (!boardNav || isDragging) return;
          const target = e.target;
          if (!(target instanceof Element)) return;
          if (target.closest("[data-task-card-root],button,input,textarea,[role=menu],[role=menuitem]")) {
            return;
          }
          // Blank list chrome should still count as interacting with this list.
          boardNav.selectList(list.id);
        }}
      >
        {!isDragging && (
          <ListStackedBody
            board={board}
            list={list}
            listId={listId}
            visibleStatuses={visibleStatuses}
            workflowOrder={workflowOrder}
            dragHandleRef={handleRef}
            taskContainerId={taskContainerId}
            sortableIds={sortableIds}
          />
        )}
      </div>
    </div>
  );
});
