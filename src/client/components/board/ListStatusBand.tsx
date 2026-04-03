import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  ALL_TASK_GROUPS,
  groupDisplayLabelForId,
  type Board,
  type List,
  type Task,
} from "../../../shared/models";
import { useCreateTask, useUpdateTask } from "@/api/mutations";
import { useStatuses } from "@/api/queries";
import { TaskCard } from "@/components/task/TaskCard";
import { TaskEditor } from "@/components/task/TaskEditor";
import { useBoardTaskKeyboardBridge } from "@/components/board/shortcuts/BoardTaskKeyboardBridge";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import {
  type TaskCardViewMode,
  useResolvedActiveTaskGroup,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskCardViewMode,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import { cn } from "@/lib/utils";
import { taskMatchesDateFilter } from "./boardStatusUtils";
import { parseTaskSortableId } from "./dndIds";
import { SortableTaskRow } from "./SortableTaskRow";
import { useBoardTaskContainerDroppableReact } from "./useBoardTaskContainerDroppableReact";
import { scrollElementToBottomThen } from "./useVerticalScrollOverflow";

interface ListStatusBandProps {
  board: Board;
  list: List;
  status: string;
  /** When set, this band is a droppable sortable container. */
  containerId?: string;
  /** Ordered sortable task IDs from the DnD state. */
  sortableIds?: string[];
}

export function ListStatusBand({
  board,
  list,
  status,
  containerId,
  sortableIds,
}: ListStatusBandProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: statuses } = useStatuses();
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.id,
    board.taskPriorities,
  );
  const dateFilterResolved = useResolvedTaskDateFilter(board.id);
  const taskCardViewMode = useResolvedTaskCardViewMode(board.id);

  // O(1) task lookup map — avoids O(n) board.tasks.find() in render loops
  const taskMap = useMemo(() => {
    const m = new Map<number, Task>();
    for (const t of board.tasks) m.set(t.id, t);
    return m;
  }, [board.tasks]);

  const tasks = useMemo(() => {
    let listTasks = board.tasks.filter(
      (t) => t.listId === list.id && t.status === status,
    );
    if (activeGroup !== ALL_TASK_GROUPS) {
      listTasks = listTasks.filter(
        (t) => String(t.groupId) === activeGroup,
      );
    }
    if (activePriorityIds !== null) {
      listTasks = listTasks.filter(
        (t) =>
          t.priorityId != null &&
          activePriorityIds.includes(String(t.priorityId)),
      );
    }
    if (dateFilterResolved != null) {
      listTasks = listTasks.filter((t) =>
        taskMatchesDateFilter(t, dateFilterResolved),
      );
    }
    return listTasks.sort((a, b) => a.order - b.order);
  }, [
    board.tasks,
    list.id,
    status,
    activeGroup,
    activePriorityIds,
    dateFilterResolved,
  ]);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const createPendingRef = useRef(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTitleTaskId, setEditingTitleTaskId] = useState<number | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState("");
  createPendingRef.current = createTask.isPending;

  const resolvedEditTask =
    editingTask !== null
      ? (taskMap.get(editingTask.id) ?? editingTask)
      : null;

  // Stable callback: takes task id, resolves from ref to avoid stale closures
  const boardRef = useRef(board);
  boardRef.current = board;
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const handleComplete = useCallback(
    (taskId: number) => {
      const t = boardRef.current.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const closedId =
        statusesRef.current?.find((s) => s.isClosed)?.id ?? "closed";
      const now = new Date().toISOString();
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
    [updateTask],
  );

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const handleEdit = useCallback((taskId: number) => {
    setEditingTaskId(taskId);
  }, []);

  const cancelInlineTitleEdit = useCallback(() => {
    setEditingTitleTaskId(null);
    setEditingTitleDraft("");
  }, []);

  const startInlineTitleEdit = useCallback(
    (taskId: number) => {
      const taskToEdit = boardRef.current.tasks.find((entry) => entry.id === taskId);
      if (!taskToEdit || taskToEdit.listId !== list.id) return false;
      // F2 should only swap the title text into edit mode and keep the rest of the task card in place.
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
  // Enter on highlighted task: open editor in this list column if the task belongs here.
  useEffect(() => {
    return registerOpenTaskEditor((taskId) => {
      const t = board.tasks.find((x) => x.id === taskId);
      if (!t || t.listId !== list.id) return false;
      cancelInlineTitleEdit();
      setEditingTaskId(taskId);
      return true;
    });
  }, [board.tasks, cancelInlineTitleEdit, list.id, registerOpenTaskEditor]);

  useEffect(() => {
    return registerEditTaskTitle((taskId) => startInlineTitleEdit(taskId));
  }, [registerEditTaskTitle, startInlineTitleEdit]);

  // Keep editingTask in sync for the TaskEditor
  const editTaskResolved = editingTaskId != null ? (taskMap.get(editingTaskId) ?? null) : null;

  // Legacy completeFromList for static (non-sortable) task cards
  const completeFromList = (t: Task) => {
    handleComplete(t.id);
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

  const boardNav = useBoardKeyboardNavOptional();
  const openComposerAtBottomRef = useRef(openComposerAtBottom);
  openComposerAtBottomRef.current = openComposerAtBottom;
  useEffect(() => {
    // Register the open-band add-task flow so board shortcut "t" can open the composer.
    if (status !== "open") return;
    if (!boardNav) return;
    return boardNav.registerAddTaskComposer(list.id, () => {
      openComposerAtBottomRef.current();
    });
  }, [status, list.id, boardNav]);

  const submitCard = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const defaultGroupId =
      activeGroup !== ALL_TASK_GROUPS
        ? Number(activeGroup)
        : board.taskGroups[0]?.id ?? 0;
    createTask.mutate(
      {
        boardId: board.id,
        listId: list.id,
        status,
        title: trimmed,
        body: "",
        groupId: defaultGroupId,
      },
      {
        onSuccess: () => {
          setTitle("");
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
        >
          <div className="flex flex-col gap-2">
            {containerId != null && sortableIds != null ? (
              <SortableBandContent
                taskMap={taskMap}
                taskGroups={board.taskGroups}
                taskPriorities={board.taskPriorities}
                viewMode={taskCardViewMode}
                listId={list.id}
                status={status}
                containerId={containerId}
                sortableIds={sortableIds}
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
                    key={task.id}
                    task={task}
                    taskPriorities={board.taskPriorities}
                    viewMode={taskCardViewMode}
                    groupLabel={groupDisplayLabelForId(board.taskGroups, task.groupId)}
                    onOpen={() => setEditingTask(task)}
                    editingTitle={editingTitleTaskId === task.id}
                    titleDraft={editingTitleTaskId === task.id ? editingTitleDraft : undefined}
                    onTitleDraftChange={setEditingTitleDraft}
                    onTitleCommit={() => void commitInlineTitleEdit()}
                    onTitleCancel={cancelInlineTitleEdit}
                    titleEditBusy={updateTask.isPending}
                    onCompleteFromCircle={() => completeFromList(task)}
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
          board={board}
          open={editingTask !== null || editingTaskId !== null}
          onClose={() => { setEditingTask(null); setEditingTaskId(null); }}
          mode="edit"
          task={resolvedEditTask ?? editTaskResolved ?? undefined}
        />
      </>
    );
  }

  // Non-open bands: simple list, no add-task UI, scroll handled by parent.
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {containerId != null && sortableIds != null ? (
          <SortableBandContent
            taskMap={taskMap}
            taskGroups={board.taskGroups}
            taskPriorities={board.taskPriorities}
            viewMode={taskCardViewMode}
            listId={list.id}
            status={status}
            containerId={containerId}
            sortableIds={sortableIds}
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
                key={task.id}
                task={task}
                taskPriorities={board.taskPriorities}
                viewMode={taskCardViewMode}
                groupLabel={groupDisplayLabelForId(board.taskGroups, task.groupId)}
                onOpen={() => setEditingTask(task)}
                editingTitle={editingTitleTaskId === task.id}
                titleDraft={editingTitleTaskId === task.id ? editingTitleDraft : undefined}
                onTitleDraftChange={setEditingTitleDraft}
                onTitleCommit={() => void commitInlineTitleEdit()}
                onTitleCancel={cancelInlineTitleEdit}
                titleEditBusy={updateTask.isPending}
              />
            ))}
          </div>
        )}
      </div>

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

/** Per-row component that derives stable callbacks from task id, avoiding inline closures */
const SortableTaskRowById = memo(function SortableTaskRowById({
  sid,
  containerId,
  index,
  task,
  taskGroups,
  taskPriorities,
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
  viewMode: TaskCardViewMode;
  onComplete: (taskId: number) => void;
  onEdit: (taskId: number) => void;
  editingTitle: boolean;
  titleDraft?: string;
  onTitleDraftChange: (value: string) => void;
  onTitleCommit: () => void;
  onTitleCancel: () => void;
  titleEditBusy: boolean;
}) {
  const handleOpen = useCallback(() => onEdit(task.id), [onEdit, task.id]);
  const handleComplete = useCallback(
    () => onComplete(task.id),
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
      onOpen={handleOpen}
      editingTitle={editingTitle}
      titleDraft={titleDraft}
      onTitleDraftChange={onTitleDraftChange}
      onTitleCommit={onTitleCommit}
      onTitleCancel={onTitleCancel}
      titleEditBusy={titleEditBusy}
      onCompleteFromCircle={task.status === "open" ? handleComplete : undefined}
    />
  );
});

// Memoized to prevent re-rendering the entire band on unrelated drag-over events
const SortableBandContent = memo(function SortableBandContent({
  taskMap,
  taskGroups,
  taskPriorities,
  viewMode,
  listId,
  status,
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
}: {
  taskMap: Map<number, Task>;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  viewMode: TaskCardViewMode;
  listId: number;
  status: string;
  containerId: string;
  sortableIds: string[];
  onComplete: (taskId: number) => void;
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

  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-6 flex-col gap-2 rounded-md",
        isDropTarget && "bg-primary/[0.07] ring-1 ring-primary/15",
      )}
    >
      {sortableIds.map((sid, index) => {
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
        );
      })}
    </div>
  );
});
