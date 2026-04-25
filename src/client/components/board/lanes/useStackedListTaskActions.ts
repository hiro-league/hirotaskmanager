import { useCallback, useEffect, useRef, useState } from "react";
import {
  effectiveDefaultTaskGroupId,
  type Board,
  type List,
  type Task,
} from "../../../../shared/models";
import { normalizeStoredTaskTitle } from "../../../../shared/taskTitle";
import { useCreateTask, useUpdateTask } from "@/api/mutations";
import { useStatuses } from "@/api/queries";
import { useBoardTaskKeyboardBridge } from "@/components/board/shortcuts/BoardTaskKeyboardBridge";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";

interface UseStackedListTaskActionsParams {
  boardId: number;
  list: List;
  boardTasks: readonly Task[];
  taskGroups: Board["taskGroups"];
  defaultTaskGroupId: number;
  workflowOrder: readonly string[];
  visibleStatuses: string[];
  taskMap: Map<number, Task>;
}

export function useStackedListTaskActions({
  boardId,
  list,
  boardTasks,
  taskGroups,
  defaultTaskGroupId,
  workflowOrder,
  visibleStatuses,
  taskMap,
}: UseStackedListTaskActionsParams) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: statuses } = useStatuses();
  const boardNav = useBoardKeyboardNavOptional();
  const completion = useBoardTaskCompletionCelebrationOptional();

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const createPendingRef = useRef(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTitleTaskId, setEditingTitleTaskId] = useState<number | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState("");
  createPendingRef.current = createTask.isPending;

  const resolvedEditTask =
    editingTask !== null
      ? (taskMap.get(editingTask.taskId) ?? editingTask)
      : null;
  const editTaskResolved = editingTaskId != null ? (taskMap.get(editingTaskId) ?? null) : null;

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

  const handleEdit = useCallback((taskId: number) => {
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
    const nextTitle = normalizeStoredTaskTitle(
      editingTitleDraft.trim() || "Untitled",
    );
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

  // Keyboard bridge: open editor / inline title edit
  const { registerOpenTaskEditor, registerEditTaskTitle } = useBoardTaskKeyboardBridge();
  useEffect(() => {
    return registerOpenTaskEditor((taskId) => {
      const t = boardTasks.find((x) => x.taskId === taskId);
      if (!t || t.listId !== list.listId) return false;
      cancelInlineTitleEdit();
      boardNav?.selectTask(taskId);
      setEditingTaskId(taskId);
      return true;
    });
  }, [boardTasks, cancelInlineTitleEdit, list.listId, registerOpenTaskEditor, boardNav]);

  useEffect(() => {
    return registerEditTaskTitle((taskId) => startInlineTitleEdit(taskId));
  }, [registerEditTaskTitle, startInlineTitleEdit]);

  // Quick-add state
  const quickAddStatus =
    workflowOrder.includes("open") ? "open" : (workflowOrder[0] ?? "open");
  const canAddOpen = visibleStatuses.includes(quickAddStatus);

  const cancelAdd = useCallback(() => {
    setAdding(false);
    setTitle("");
  }, []);

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

  const openComposerAtQuickAddPosition = useCallback(() => {
    if (adding) {
      scrollComposerIntoView();
      return;
    }
    setAdding(true);
  }, [adding, scrollComposerIntoView]);

  const focusComposerAtQuickAddPosition = useCallback(() => {
    window.requestAnimationFrame(() => {
      scrollComposerIntoView();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    });
  }, [scrollComposerIntoView]);

  const submitTask = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const defaultGroupId = effectiveDefaultTaskGroupId({
      taskGroups,
      defaultTaskGroupId,
    });
    createTask.mutate(
      {
        boardId,
        listId: list.listId,
        status: quickAddStatus,
        title: normalizeStoredTaskTitle(trimmed),
        body: "",
        groupId: defaultGroupId,
      },
      {
        onSuccess: (data) => {
          setTitle("");
          // Move the keyboard highlight to the new task so consecutive adds
          // animate the selection forward instead of jumping only on cancel.
          // selectTask only updates the highlight ring + scrolls; it does not
          // call .focus(), so the composer keeps the textarea focus for the
          // next add (re-asserted by focusComposerAtQuickAddPosition below).
          boardNav?.selectTask(data.entity.taskId);
          focusComposerAtQuickAddPosition();
        },
      },
    );
  }, [boardId, boardNav, createTask, defaultTaskGroupId, focusComposerAtQuickAddPosition, list.listId, quickAddStatus, taskGroups, title]);

  const handleTextareaBlur = useCallback(() => {
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
  }, [cancelAdd]);

  // Register add-task composer for keyboard "t"
  const openComposerRef = useRef(openComposerAtQuickAddPosition);
  openComposerRef.current = openComposerAtQuickAddPosition;
  useEffect(() => {
    if (!canAddOpen) return;
    if (!boardNav) return;
    return boardNav.registerAddTaskComposer(list.listId, () => {
      openComposerRef.current();
    });
  }, [canAddOpen, list.listId, boardNav]);

  const closeEditor = useCallback(() => {
    setEditingTask(null);
    setEditingTaskId(null);
  }, []);

  const openStaticEditor = useCallback((task: Task) => {
    setEditingTask(task);
  }, []);

  return {
    // Mutations
    createTask,
    updateTask,
    // Complete
    handleComplete,
    // Edit
    handleEdit,
    resolvedEditTask,
    editTaskResolved,
    editorOpen: editingTask !== null || editingTaskId !== null,
    closeEditor,
    openStaticEditor,
    // Inline title edit
    editingTitleTaskId,
    editingTitleDraft,
    setEditingTitleDraft,
    cancelInlineTitleEdit,
    commitInlineTitleEdit,
    titleEditBusy: updateTask.isPending,
    // Quick-add
    adding,
    title,
    setTitle,
    inputRef,
    addCardRef,
    scrollRef,
    getScrollElement,
    submitTask,
    cancelAdd,
    handleTextareaBlur,
    openComposerAtQuickAddPosition,
    quickAddStatus,
    canAddOpen,
    createIsPending: createTask.isPending,
  } as const;
}
