import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  effectiveDefaultTaskGroupId,
  noneTaskPriorityId,
  sortPrioritiesByValue,
  type Task,
} from "../../../shared/models";
import { normalizeStoredTaskTitle } from "../../../shared/taskTitle";
import type { TaskEditorBoardData } from "@/components/board/boardColumnData";
import { useCreateTask, useUpdateTask } from "@/api/mutations";
import { useBoardTaskDetail } from "@/api/useBoardTaskDetail";

// Release select values mirror API omit vs null vs id (see task create contract in server routes).
/** Create: omit `releaseId` in API body so server can auto-assign from board rules. */
export const RELEASE_SELECT_AUTO = "__auto__";
/** Explicit unassigned / no release (`releaseId: null` in API). */
export const RELEASE_SELECT_NONE = "__none__";

interface TaskEditorFormBaseline {
  title: string;
  body: string;
  group: string;
  priority: string;
  release: string;
  emoji: string | null;
}

/**
 * Board list tasks and `useBoardTaskDetail` share a cache key family but update on different
 * schedules. Prefer the snapshot with the newer `updatedAt` so optimistic board updates (e.g.
 * workflow buttons) win over stale detail rows until `onSuccess` refreshes the detail cache.
 * When timestamps tie, prefer detail — board payloads may be slim until the detail fetch lands.
 */
function pickTaskSnapshotForSync(boardTask: Task, detail: Task | undefined): Task {
  if (detail == null) return boardTask;
  const boardTime = Date.parse(boardTask.updatedAt);
  const detailTime = Date.parse(detail.updatedAt);
  if (!Number.isFinite(boardTime) || !Number.isFinite(detailTime)) {
    return detail;
  }
  if (boardTime > detailTime) return boardTask;
  return detail;
}

export interface UseTaskEditorFormArgs {
  board: TaskEditorBoardData;
  open: boolean;
  mode: "create" | "edit";
  createContext?: { listId: number; status: string };
  task?: Task | null;
  onClose: () => void;
}

export function useTaskEditorForm({
  board,
  open,
  mode,
  createContext,
  task,
  onClose,
}: UseTaskEditorFormArgs) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const taskDetailQuery = useBoardTaskDetail(board.boardId, task?.taskId, {
    enabled: open && mode === "edit" && task != null,
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  /** Task icon; null clears. */
  const [emoji, setEmoji] = useState<string | null>(null);
  /** Select value — matches `String(taskGroup.groupId)`. */
  const [group, setGroup] = useState("");
  /** Select value — matches `String(taskPriority.priorityId)` (default builtin `none`). */
  const [priority, setPriority] = useState("");
  /** `RELEASE_SELECT_*` or `String(releaseId)` for edit/create. */
  const [release, setRelease] = useState(RELEASE_SELECT_AUTO);

  const baselineRef = useRef<TaskEditorFormBaseline>({
    title: "",
    body: "",
    group: "",
    priority: "",
    release: RELEASE_SELECT_AUTO,
    emoji: null,
  });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && task) {
      if (taskDetailQuery.isPending) {
        setTitle(task.title);
        // Avoid letting the user edit a possibly slim `body` from the board payload.
        setBody("");
        setEmoji(task.emoji ?? null);
        setGroup(String(task.groupId));
        setPriority(String(task.priorityId));
        const rel =
          task.releaseId != null ? String(task.releaseId) : RELEASE_SELECT_NONE;
        setRelease(rel);
        baselineRef.current = {
          title: task.title,
          body: "",
          group: String(task.groupId),
          priority: String(task.priorityId),
          release: rel,
          emoji: task.emoji ?? null,
        };
        return;
      }
      const t = pickTaskSnapshotForSync(task, taskDetailQuery.data);
      setTitle(t.title);
      setBody(t.body);
      setEmoji(t.emoji ?? null);
      setGroup(String(t.groupId));
      setPriority(String(t.priorityId));
      const rel =
        t.releaseId != null ? String(t.releaseId) : RELEASE_SELECT_NONE;
      setRelease(rel);
      baselineRef.current = {
        title: t.title,
        body: t.body,
        group: String(t.groupId),
        priority: String(t.priorityId),
        release: rel,
        emoji: t.emoji ?? null,
      };
    } else if (mode === "create" && createContext) {
      setTitle("");
      setBody("");
      setEmoji(null);
      // Creation always starts from the board default group; the board filter only affects visibility.
      const defaultGroup = String(effectiveDefaultTaskGroupId(board));
      setGroup(defaultGroup);
      const defaultPri = String(
        noneTaskPriorityId(board.taskPriorities) ??
          sortPrioritiesByValue(board.taskPriorities)[0]!.priorityId,
      );
      setPriority(defaultPri);
      setRelease(RELEASE_SELECT_AUTO);
      baselineRef.current = {
        title: "",
        body: "",
        group: defaultGroup,
        priority: defaultPri,
        release: RELEASE_SELECT_AUTO,
        emoji: null,
      };
    }
  }, [
    open,
    mode,
    task,
    createContext,
    board.taskGroups,
    board.taskPriorities,
    board.defaultTaskGroupId,
    taskDetailQuery.isPending,
    taskDetailQuery.data,
  ]);

  const isDirty = useMemo(() => {
    if (!open) return false;
    if (mode === "edit" && task) {
      return (
        title.trim() !== baselineRef.current.title.trim() ||
        body !== baselineRef.current.body ||
        group !== baselineRef.current.group ||
        priority !== baselineRef.current.priority ||
        release !== baselineRef.current.release ||
        (emoji ?? null) !== (baselineRef.current.emoji ?? null)
      );
    }
    if (mode === "create" && createContext) {
      // Track board-owned selects as dirty so closing after a priority change
      // does not silently discard a user choice.
      return (
        title.trim() !== "" ||
        body.trim() !== "" ||
        group !== baselineRef.current.group ||
        priority !== baselineRef.current.priority ||
        release !== baselineRef.current.release ||
        (emoji ?? null) !== (baselineRef.current.emoji ?? null)
      );
    }
    return false;
  }, [open, mode, task, createContext, title, body, group, priority, release, emoji]);

  /**
   * Merge current form fields into the edit `task` snapshot (same shape as Save).
   * Used by workflow buttons so status changes cannot overwrite unsaved title/body/etc.
   */
  const buildEditTaskFromForm = useCallback((): Task => {
    if (mode !== "edit" || !task) {
      throw new Error("buildEditTaskFromForm is only valid in edit mode with a task");
    }
    const trimmedTitle = normalizeStoredTaskTitle(title.trim() || "Untitled");
    const now = new Date().toISOString();
    const priorityNum = Number(priority);
    const priorityId = Number.isFinite(priorityNum)
      ? priorityNum
      : (noneTaskPriorityId(board.taskPriorities) ??
        sortPrioritiesByValue(board.taskPriorities)[0]!.priorityId);
    const gid = Number(group) || task.groupId;
    const nextReleaseId =
      release === RELEASE_SELECT_NONE ? null : Number(release);
    return {
      ...task,
      title: trimmedTitle,
      body,
      groupId: gid,
      priorityId,
      releaseId: nextReleaseId,
      emoji: emoji ?? null,
      updatedAt: now,
    };
  }, [
    mode,
    task,
    board.taskPriorities,
    title,
    body,
    group,
    priority,
    release,
    emoji,
  ]);

  const handleSave = useCallback(async () => {
    const priorityNum = Number(priority);
    const priorityId = Number.isFinite(priorityNum)
      ? priorityNum
      : (noneTaskPriorityId(board.taskPriorities) ??
        sortPrioritiesByValue(board.taskPriorities)[0]!.priorityId);
    if (mode === "create" && createContext) {
      const trimmedTitle = normalizeStoredTaskTitle(title.trim() || "Untitled");
      const gid = Number(group) || effectiveDefaultTaskGroupId(board);
      const defaultNone = noneTaskPriorityId(board.taskPriorities);
      let releasePayload: number | null | undefined;
      if (release === RELEASE_SELECT_NONE) releasePayload = null;
      else if (release !== RELEASE_SELECT_AUTO) releasePayload = Number(release);
      else releasePayload = undefined;
      await createTask.mutateAsync({
        boardId: board.boardId,
        listId: createContext.listId,
        status: createContext.status,
        title: trimmedTitle,
        body,
        groupId: gid,
        ...(priorityId !== defaultNone ? { priorityId } : {}),
        ...(releasePayload !== undefined ? { releaseId: releasePayload } : {}),
        emoji: emoji ?? null,
      });
    } else if (mode === "edit" && task) {
      await updateTask.mutateAsync({
        boardId: board.boardId,
        task: buildEditTaskFromForm(),
      });
    }
    onClose();
  }, [
    mode,
    createContext,
    task,
    board.boardId,
    board.taskPriorities,
    board.taskGroups,
    board.defaultTaskGroupId,
    title,
    body,
    emoji,
    group,
    priority,
    release,
    createTask,
    updateTask,
    onClose,
    buildEditTaskFromForm,
  ]);

  return {
    title,
    setTitle,
    body,
    setBody,
    emoji,
    setEmoji,
    group,
    setGroup,
    priority,
    setPriority,
    release,
    setRelease,
    isDirty,
    handleSave,
    buildEditTaskFromForm,
    taskDetailQuery,
    createTask,
    updateTask,
  };
}
