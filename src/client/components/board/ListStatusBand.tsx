import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  effectiveDefaultTaskGroupId,
  groupDisplayLabelForId,
  type Board,
  type List,
  type Task,
} from "../../../shared/models";
import type { BoardBandSpreadProps } from "./boardColumnData";
import { useCreateTask, useUpdateTask } from "@/api/mutations";
import { useStatuses } from "@/api/queries";
import { TaskCard, taskReleasePill } from "@/components/task/TaskCard";
import { TaskEditor } from "@/components/task/TaskEditor";
import { useBoardTaskKeyboardBridge } from "@/components/board/shortcuts/BoardTaskKeyboardBridge";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import {
  type TaskCardViewMode,
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskCardViewMode,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import { cn } from "@/lib/utils";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";
import {
  listStatusTasksSortedFromIndex,
  type BoardTaskFilterState,
} from "./boardStatusUtils";
import { parseTaskSortableId } from "./dndIds";
import { SortableTaskRow } from "./SortableTaskRow";
import { useBoardTaskContainerDroppableReact } from "./useBoardTaskContainerDroppableReact";
import { useVirtualizedBand } from "./useVirtualizedBand";
import { scrollElementToBottomThen } from "./useVerticalScrollOverflow";

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

// Memo: avoids re-rendering all bands when an unrelated `board` wrapper churns but
// task slices and filters are unchanged (board perf plan #2).
export const ListStatusBand = memo(function ListStatusBand({
  boardId,
  taskGroups,
  taskPriorities,
  releases,
  defaultTaskGroupId,
  boardTasks,
  list,
  status,
  tasksByListStatus,
  containerId,
  sortableIds,
}: ListStatusBandProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: statuses } = useStatuses();
  const activeGroupIds = useResolvedActiveTaskGroupIds(boardId, taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    boardId,
    taskPriorities,
  );
  const activeReleaseIds = useResolvedActiveReleaseIds(boardId, releases);
  const dateFilterResolved = useResolvedTaskDateFilter(boardId);
  const taskCardViewMode = useResolvedTaskCardViewMode(boardId);
  const boardNav = useBoardKeyboardNavOptional();
  const completion = useBoardTaskCompletionCelebrationOptional();

  // O(1) task lookup map — avoids O(n) board.tasks.find() in render loops
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

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const createPendingRef = useRef(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTitleTaskId, setEditingTitleTaskId] = useState<number | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState("");
  createPendingRef.current = createTask.isPending;

  const resolvedEditTask =
    editingTask !== null
      ? (taskMap.get(editingTask.taskId) ?? editingTask)
      : null;

  // Stable callback: takes task id, resolves from ref to avoid stale closures
  const surfaceRef = useRef({ boardId, boardTasks });
  surfaceRef.current = { boardId, boardTasks };
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const handleComplete = useCallback(
    (taskId: number, anchorEl?: HTMLElement) => {
      const t = surfaceRef.current.boardTasks.find((x) => x.taskId === taskId);
      if (!t) return;
      const closedId =
        statusesRef.current?.find((s) => s.isClosed)?.statusId ?? "closed";
      const now = new Date().toISOString();
      completion?.celebrateTaskCompletion({ taskId, anchorEl });
      updateTask.mutate({
        boardId: surfaceRef.current.boardId,
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

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const handleEdit = useCallback((taskId: number) => {
    // Task-open flows should reuse the shared board selection state so canceling
    // the editor leaves the last-opened task current.
    boardNav?.selectTask(taskId);
    setEditingTaskId(taskId);
  }, [boardNav]);

  const cancelInlineTitleEdit = useCallback(() => {
    setEditingTitleTaskId(null);
    setEditingTitleDraft("");
  }, []);

  const startInlineTitleEdit = useCallback(
    (taskId: number) => {
      const taskToEdit = surfaceRef.current.boardTasks.find(
        (entry) => entry.taskId === taskId,
      );
      if (!taskToEdit || taskToEdit.listId !== list.listId) return false;
      // F2 should only swap the title text into edit mode and keep the rest of the task card in place.
      setEditingTask(null);
      setEditingTaskId(null);
      setEditingTitleTaskId(taskId);
      setEditingTitleDraft(taskToEdit.title);
      return true;
    },
    [list.listId],
  );

  const commitInlineTitleEdit = useCallback(async () => {
    const taskId = editingTitleTaskId;
    if (taskId == null) return;
    const taskToEdit = surfaceRef.current.boardTasks.find(
      (entry) => entry.taskId === taskId,
    );
    cancelInlineTitleEdit();
    if (!taskToEdit) return;
    const nextTitle = editingTitleDraft.trim() || "Untitled";
    if (nextTitle === taskToEdit.title) return;
    await updateTask.mutateAsync({
      boardId: surfaceRef.current.boardId,
      task: {
        ...taskToEdit,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
      },
    });
  }, [cancelInlineTitleEdit, editingTitleDraft, editingTitleTaskId, updateTask]);

  const { registerOpenTaskEditor, registerEditTaskTitle } = useBoardTaskKeyboardBridge();
  // Enter on highlighted task: open editor in this list column if the task belongs here.
  useEffect(() => {
    return registerOpenTaskEditor((taskId) => {
      const t = boardTasks.find((x) => x.taskId === taskId);
      if (!t || t.listId !== list.listId) return false;
      cancelInlineTitleEdit();
      boardNav?.selectTask(taskId);
      setEditingTaskId(taskId);
      return true;
    });
  }, [boardTasks, boardNav, cancelInlineTitleEdit, list.listId, registerOpenTaskEditor]);

  useEffect(() => {
    return registerEditTaskTitle((taskId) => startInlineTitleEdit(taskId));
  }, [registerEditTaskTitle, startInlineTitleEdit]);

  // Keep editingTask in sync for the TaskEditor
  const editTaskResolved = editingTaskId != null ? (taskMap.get(editingTaskId) ?? null) : null;

  // Legacy completeFromList for static (non-sortable) task cards
  const completeFromList = (t: Task, anchorEl?: HTMLElement) => {
    handleComplete(t.taskId, anchorEl);
  };

  useEffect(() => {
    if (!adding) return;
    inputRef.current?.focus();
  }, [adding]);

  const cancelAdd = () => {
    setAdding(false);
    setTitle("");
  };

  const openComposerAtBottom = () => {
    // The composer adds extra height after mount, so do a second bottom snap
    // once the textarea + actions exist to avoid landing midway down the list.
    scrollElementToBottomThen(scrollRef.current, () => {
      setAdding(true);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const scrollEl = scrollRef.current;
          if (!scrollEl) return;
          scrollEl.scrollTop = scrollEl.scrollHeight;
          inputRef.current?.focus();
        });
      });
    });
  };

  const focusComposerAtBottom = () => {
    // After creating another task, snap back to the list bottom before refocusing.
    window.requestAnimationFrame(() => {
      scrollElementToBottomThen(scrollRef.current, () => {
        window.setTimeout(() => inputRef.current?.focus(), 0);
      });
    });
  };

  const openComposerAtBottomRef = useRef(openComposerAtBottom);
  openComposerAtBottomRef.current = openComposerAtBottom;
  useEffect(() => {
    // Register the open-band add-task flow so board shortcut "t" can open the composer.
    if (status !== "open") return;
    if (!boardNav) return;
    return boardNav.registerAddTaskComposer(list.listId, () => {
      openComposerAtBottomRef.current();
    });
  }, [status, list.listId, boardNav]);

  const submitCard = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const existingTaskIds = new Set(
      surfaceRef.current.boardTasks.map((task) => task.taskId),
    );
    // New tasks always start in the board default group, even when the filter narrows visible groups.
    const defaultGroupId = effectiveDefaultTaskGroupId({
      taskGroups,
      defaultTaskGroupId,
    });
    createTask.mutate(
      {
        boardId,
        listId: list.listId,
        status,
        title: trimmed,
        body: "",
        groupId: defaultGroupId,
      },
      {
        onSuccess: (data) => {
          setTitle("");
          const createdTask =
            !existingTaskIds.has(data.entity.taskId) &&
            data.entity.listId === list.listId &&
            data.entity.status === status
              ? data.entity
              : null;
          // After creating a task, move selection to the new task instead of
          // leaving the highlight behind on an older interaction.
          if (createdTask) boardNav?.selectTask(createdTask.taskId);
          focusComposerAtBottom();
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

  const isOpenBand = status === "open";
  // Keep one add affordance in lanes: the hover FAB stays anchored to the
  // band's bottom edge even when the content is too short to scroll.
  const showFab = isOpenBand && !adding;

  // Open band: own scroll container so the FAB sibling is anchored to the
  // band's visible bottom edge (not inside the scrollable content).
  if (isOpenBand) {
    return (
      <>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-2"
          data-board-id={boardId}
          data-list-id={list.listId}
          data-status={status}
          aria-label={`${list.name} — ${status}`}
        >
          <div className="flex flex-col gap-2">
            {containerId != null && sortableIds != null ? (
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
                getScrollElement={getScrollElement}
                onComplete={handleComplete}
                onEdit={handleEdit}
                editingTitleTaskId={editingTitleTaskId}
                editingTitleDraft={editingTitleDraft}
                onTitleDraftChange={setEditingTitleDraft}
                onTitleCommit={() => void commitInlineTitleEdit()}
                onTitleCancel={cancelInlineTitleEdit}
                titleEditBusy={updateTask.isPending}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    taskPriorities={taskPriorities}
                    viewMode={taskCardViewMode}
                    groupLabel={groupDisplayLabelForId(taskGroups, task.groupId)}
                    releasePill={taskReleasePill({ releases }, task)}
                    onOpen={() => setEditingTask(task)}
                    editingTitle={editingTitleTaskId === task.taskId}
                    titleDraft={editingTitleTaskId === task.taskId ? editingTitleDraft : undefined}
                    onTitleDraftChange={setEditingTitleDraft}
                    onTitleCommit={() => void commitInlineTitleEdit()}
                    onTitleCancel={cancelInlineTitleEdit}
                    titleEditBusy={updateTask.isPending}
                    onCompleteFromCircle={(anchorEl) =>
                      completeFromList(task, anchorEl)
                    }
                  />
                ))}
              </div>
            )}

            {/* Composer */}
            {adding && (
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
                      submitCard();
                    }
                    if (e.key === "Escape") cancelAdd();
                  }}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    disabled={createTask.isPending || !title.trim()}
                    onClick={() => submitCard()}
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
            )}
          </div>
        </div>

        {/* FAB — sibling of scroll div, never scrolls.
            Hidden until the list column is hovered (group-hover/list-col). */}
        {showFab && (
          <button
            type="button"
            aria-label="Add task"
            className={cn(
              "absolute bottom-3 right-3 z-10",
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-md ring-1 ring-border/60",
              "opacity-0 pointer-events-none transition-opacity duration-150",
              "group-hover/list-col:opacity-100 group-hover/list-col:pointer-events-auto",
              "hover:opacity-90",
              "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            onClick={(e) => {
              e.stopPropagation();
              openComposerAtBottom();
            }}
          >
            <Plus className="size-6" strokeWidth={2.5} aria-hidden />
          </button>
        )}

        <TaskEditor
          board={{
            boardId,
            taskGroups,
            taskPriorities,
            releases,
            defaultTaskGroupId,
          }}
          open={editingTask !== null || editingTaskId !== null}
          onClose={() => { setEditingTask(null); setEditingTaskId(null); }}
          mode="edit"
          task={resolvedEditTask ?? editTaskResolved ?? undefined}
        />
      </>
    );
  }

  // Non-open bands: same task rows without the open-band composer/FAB chrome.
  return (
    <>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-2"
        data-board-id={boardId}
        data-list-id={list.listId}
        data-status={status}
        aria-label={`${list.name} — ${status}`}
      >
        <div className="flex flex-col gap-2">
          {containerId != null && sortableIds != null ? (
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
              getScrollElement={getScrollElement}
              onComplete={handleComplete}
              onEdit={handleEdit}
              editingTitleTaskId={editingTitleTaskId}
              editingTitleDraft={editingTitleDraft}
              onTitleDraftChange={setEditingTitleDraft}
              onTitleCommit={() => void commitInlineTitleEdit()}
              onTitleCancel={cancelInlineTitleEdit}
              titleEditBusy={updateTask.isPending}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  taskPriorities={taskPriorities}
                  viewMode={taskCardViewMode}
                  groupLabel={groupDisplayLabelForId(taskGroups, task.groupId)}
                  releasePill={taskReleasePill({ releases }, task)}
                  onOpen={() => setEditingTask(task)}
                  editingTitle={editingTitleTaskId === task.taskId}
                  titleDraft={editingTitleTaskId === task.taskId ? editingTitleDraft : undefined}
                  onTitleDraftChange={setEditingTitleDraft}
                  onTitleCommit={() => void commitInlineTitleEdit()}
                  onTitleCancel={cancelInlineTitleEdit}
                  titleEditBusy={updateTask.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <TaskEditor
        board={{
          boardId,
          taskGroups,
          taskPriorities,
          releases,
          defaultTaskGroupId,
        }}
        open={editingTask !== null || editingTaskId !== null}
        onClose={() => { setEditingTask(null); setEditingTaskId(null); }}
        mode="edit"
        task={resolvedEditTask ?? editTaskResolved ?? undefined}
      />
    </>
  );
});

/** Per-row component that derives stable callbacks from task id, avoiding inline closures */
const SortableTaskRowById = memo(function SortableTaskRowById({
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

// Memoized to prevent re-rendering the entire band on unrelated drag-over events
const SortableBandContent = memo(function SortableBandContent({
  taskMap,
  taskGroups,
  taskPriorities,
  releases,
  viewMode,
  listId,
  status,
  containerId,
  sortableIds,
  getScrollElement,
  onComplete,
  onEdit,
  editingTitleTaskId,
  editingTitleDraft,
  onTitleDraftChange,
  onTitleCommit,
  onTitleCancel,
  titleEditBusy,
}: {
  taskMap: Map<number, Task>;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  releases: Board["releases"];
  viewMode: TaskCardViewMode;
  listId: number;
  status: string;
  containerId: string;
  sortableIds: string[];
  getScrollElement: () => HTMLElement | null;
  onComplete: (taskId: number, anchorEl?: HTMLElement) => void;
  onEdit: (taskId: number) => void;
  editingTitleTaskId: number | null;
  editingTitleDraft: string;
  onTitleDraftChange: (value: string) => void;
  onTitleCommit: () => void;
  onTitleCancel: () => void;
  titleEditBusy: boolean;
}) {
  const { ref, isDropTarget } = useBoardTaskContainerDroppableReact({
    containerId,
    layout: "lanes",
    listId,
    status,
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
  });

  useEffect(() => {
    if (!boardNav || !shouldVirtualize || sortableTaskIds.length === 0) return;
    // Keyboard navigation keeps task ids in logical order, so each band
    // registers a task-id -> virtual-index revealer for offscreen highlights.
    return boardNav.registerTaskRevealer(revealTask);
  }, [boardNav, revealTask, shouldVirtualize, sortableTaskIds.length]);

  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-6 flex-col gap-2 rounded-md",
        isDropTarget && "bg-primary/[0.07] ring-1 ring-primary/15",
      )}
    >
      {shouldVirtualize ? (
        <div
          className="relative w-full"
          style={{ height: `${Math.max(totalSize, 24)}px` }}
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
                <SortableTaskRowById
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
                  editingTitle={editingTitleTaskId === task.taskId}
                  titleDraft={editingTitleTaskId === task.taskId ? editingTitleDraft : undefined}
                  onTitleDraftChange={onTitleDraftChange}
                  onTitleCommit={onTitleCommit}
                  onTitleCancel={onTitleCancel}
                  titleEditBusy={titleEditBusy}
                />
              </div>
            );
          })}
        </div>
      ) : (
        sortableIds.map((sid, index) => {
          const tid = parseTaskSortableId(sid);
          const task = tid != null ? taskMap.get(tid) : undefined;
          if (!task) return null;
          return (
            <SortableTaskRowById
              key={sid}
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
              editingTitle={editingTitleTaskId === task.taskId}
              titleDraft={editingTitleTaskId === task.taskId ? editingTitleDraft : undefined}
              onTitleDraftChange={onTitleDraftChange}
              onTitleCommit={onTitleCommit}
              onTitleCancel={onTitleCancel}
              titleEditBusy={titleEditBusy}
            />
          );
        })
      )}
    </div>
  );
});
