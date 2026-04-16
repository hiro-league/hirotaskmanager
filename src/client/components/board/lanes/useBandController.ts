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
import { scrollElementToBottomThen } from "./useVerticalScrollOverflow";

interface UseBandControllerParams {
  boardId: number;
  list: List;
  status: string;
  boardTasks: readonly Task[];
  taskGroups: Board["taskGroups"];
  defaultTaskGroupId: number;
  taskMap: Map<number, Task>;
}

export function useBandController({
  boardId,
  list,
  status,
  boardTasks,
  taskGroups,
  defaultTaskGroupId,
  taskMap,
}: UseBandControllerParams) {
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
  }, [boardTasks, boardNav, cancelInlineTitleEdit, list.listId, registerOpenTaskEditor]);

  useEffect(() => {
    return registerEditTaskTitle((taskId) => startInlineTitleEdit(taskId));
  }, [registerEditTaskTitle, startInlineTitleEdit]);

  // Legacy completeFromList for static (non-sortable) task cards
  const completeFromList = useCallback(
    (t: Task, anchorEl?: HTMLElement) => handleComplete(t.taskId, anchorEl),
    [handleComplete],
  );

  useEffect(() => {
    if (!adding) return;
    inputRef.current?.focus();
  }, [adding]);

  const cancelAdd = useCallback(() => {
    setAdding(false);
    setTitle("");
  }, []);

  const openComposerAtBottom = useCallback(() => {
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
  }, []);

  const focusComposerAtBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      scrollElementToBottomThen(scrollRef.current, () => {
        window.setTimeout(() => inputRef.current?.focus(), 0);
      });
    });
  }, []);

  const submitCard = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const existingTaskIds = new Set(
      surfaceRef.current.boardTasks.map((task) => task.taskId),
    );
    const defaultGroupId = effectiveDefaultTaskGroupId({
      taskGroups,
      defaultTaskGroupId,
    });
    createTask.mutate(
      {
        boardId,
        listId: list.listId,
        status,
        title: normalizeStoredTaskTitle(trimmed),
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
          if (createdTask) boardNav?.selectTask(createdTask.taskId);
          focusComposerAtBottom();
        },
      },
    );
  }, [boardId, boardNav, createTask, defaultTaskGroupId, focusComposerAtBottom, list.listId, status, taskGroups, title]);

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

  // Register the open-band add-task flow so board shortcut "t" can open the composer
  const openComposerAtBottomRef = useRef(openComposerAtBottom);
  openComposerAtBottomRef.current = openComposerAtBottom;
  useEffect(() => {
    if (status !== "open") return;
    if (!boardNav) return;
    return boardNav.registerAddTaskComposer(list.listId, () => {
      openComposerAtBottomRef.current();
    });
  }, [status, list.listId, boardNav]);

  const closeEditor = useCallback(() => {
    setEditingTask(null);
    setEditingTaskId(null);
  }, []);

  const openStaticEditor = useCallback((task: Task) => {
    setEditingTask(task);
  }, []);

  const isOpenBand = status === "open";
  const showFab = isOpenBand && !adding;

  return {
    // Mutations
    createTask,
    updateTask,
    // Complete
    handleComplete,
    completeFromList,
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
    submitCard,
    cancelAdd,
    handleTextareaBlur,
    openComposerAtBottom,
    createIsPending: createTask.isPending,
    // Band flags
    isOpenBand,
    showFab,
  } as const;
}
