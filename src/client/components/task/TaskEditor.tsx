import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  effectiveDefaultTaskGroupId,
  formatGroupDisplayLabel,
  noneTaskPriorityId,
  priorityDisplayLabel,
  sortPrioritiesByValue,
  sortTaskGroupsForDisplay,
  type Board,
  type Task,
} from "../../../shared/models";

// Release select values mirror API omit vs null vs id (see task create contract in server routes).
/** Create: omit `releaseId` in API body so server can auto-assign from board rules. */
const RELEASE_SELECT_AUTO = "__auto__";
/** Explicit untagged (`releaseId: null`). */
const RELEASE_SELECT_NONE = "__none__";
import { useCreateTask, useDeleteTask, useUpdateTask } from "@/api/mutations";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { ConfirmDialog } from "@/components/board/shortcuts/ConfirmDialog";
import { DiscardChangesDialog } from "@/components/board/shortcuts/DiscardChangesDialog";
import { useShortcutOverlay } from "@/components/board/shortcuts/ShortcutScopeContext";
import { useDialogCloseRequest } from "@/components/board/shortcuts/useDialogCloseRequest";
import { useModalFocusTrap } from "@/components/board/shortcuts/useModalFocusTrap";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";

interface TaskEditorProps {
  board: Board;
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  /** Required when mode is create */
  createContext?: { listId: number; status: string };
  task?: Task | null;
}

interface Baseline {
  title: string;
  body: string;
  group: string;
  priority: string;
  release: string;
  emoji: string | null;
}

export function TaskEditor({
  board,
  open,
  onClose,
  mode,
  createContext,
  task,
}: TaskEditorProps) {
  const titleId = useId();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: statuses } = useStatuses();
  const workflowOrder = useStatusWorkflowOrder();
  const completion = useBoardTaskCompletionCelebrationOptional();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  /** Task icon; null clears. */
  const [emoji, setEmoji] = useState<string | null>(null);
  /** Select value — matches `String(taskGroup.id)`. */
  const [group, setGroup] = useState("");
  /** Select value — matches `String(taskPriority.id)` (default builtin `none`). */
  const [priority, setPriority] = useState("");
  /** `RELEASE_SELECT_*` or `String(releaseId)` for edit/create. */
  const [release, setRelease] = useState(RELEASE_SELECT_AUTO);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const baselineRef = useRef<Baseline>({
    title: "",
    body: "",
    group: "",
    priority: "",
    release: RELEASE_SELECT_AUTO,
    emoji: null,
  });
  const [showDiscard, setShowDiscard] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [emojiFieldError, setEmojiFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && task) {
      setTitle(task.title);
      setBody(task.body);
      setEmoji(task.emoji ?? null);
      setGroup(String(task.groupId));
      setPriority(String(task.priorityId));
      const rel =
        task.releaseId != null ? String(task.releaseId) : RELEASE_SELECT_NONE;
      setRelease(rel);
      baselineRef.current = {
        title: task.title,
        body: task.body,
        group: String(task.groupId),
        priority: String(task.priorityId),
        release: rel,
        emoji: task.emoji ?? null,
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
          sortPrioritiesByValue(board.taskPriorities)[0]!.id,
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
  ]);

  useEffect(() => {
    if (open) setEmojiFieldError(null);
  }, [open]);

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

  const busy =
    createTask.isPending || updateTask.isPending || deleteTask.isPending;

  const requestClose = useDialogCloseRequest({
    busy,
    isDirty,
    onClose,
    onDirtyClose: () => setShowDiscard(true),
  });

  const taskEditorKeyHandler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      requestClose();
    },
    [requestClose],
  );

  const taskEditorActive = open && !showDiscard && !showDeleteConfirm;
  useShortcutOverlay(taskEditorActive, "task-editor", taskEditorKeyHandler);
  useModalFocusTrap({
    open,
    active: taskEditorActive,
    containerRef: dialogRef,
    initialFocusRef: titleInputRef,
  });

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim() || "Untitled";
    const now = new Date().toISOString();
    const priorityNum = Number(priority);
    const priorityId = Number.isFinite(priorityNum)
      ? priorityNum
      : (noneTaskPriorityId(board.taskPriorities) ??
        sortPrioritiesByValue(board.taskPriorities)[0]!.id);
    if (mode === "create" && createContext) {
      const gid =
        Number(group) || effectiveDefaultTaskGroupId(board);
      const defaultNone = noneTaskPriorityId(board.taskPriorities);
      let releasePayload: number | null | undefined;
      if (release === RELEASE_SELECT_NONE) releasePayload = null;
      else if (release !== RELEASE_SELECT_AUTO) releasePayload = Number(release);
      else releasePayload = undefined;
      await createTask.mutateAsync({
        boardId: board.id,
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
      const gid = Number(group) || task.groupId;
      const nextReleaseId =
        release === RELEASE_SELECT_NONE ? null : Number(release);
      await updateTask.mutateAsync({
        boardId: board.id,
        task: {
          ...task,
          title: trimmedTitle,
          body,
          groupId: gid,
          priorityId,
          releaseId: nextReleaseId,
          emoji: emoji ?? null,
          updatedAt: now,
        },
      });
    }
    onClose();
  }, [
    mode,
    createContext,
    task,
    board,
    title,
    body,
    emoji,
    group,
    priority,
    release,
    createTask,
    updateTask,
    onClose,
  ]);

  const closedStatusId =
    statuses?.find((s) => s.isClosed)?.id ?? "closed";
  const sortedPriorities = useMemo(
    () => sortPrioritiesByValue(board.taskPriorities),
    [board.taskPriorities],
  );

  const applyWorkflowStatus = useCallback(
    async (nextStatusId: string) => {
      if (mode !== "edit" || !task) return;
      const target = statuses?.find((s) => s.id === nextStatusId);
      const now = new Date().toISOString();
      const isClosing =
        target?.isClosed === true ||
        (target === undefined && nextStatusId === closedStatusId);
      const wasClosed =
        statuses?.find((s) => s.id === task.status)?.isClosed === true;
      if (isClosing && !wasClosed) {
        completion?.celebrateTaskCompletion({
          anchorEl: dialogRef.current ?? undefined,
        });
      }
      const nextClosedAt = isClosing ? (task.closedAt ?? now) : null;
      await updateTask.mutateAsync({
        boardId: board.id,
        task: {
          ...task,
          status: nextStatusId,
          updatedAt: now,
          closedAt: nextClosedAt,
        },
      });
    },
    [mode, task, statuses, board.id, updateTask, closedStatusId, completion],
  );

  const runDelete = useCallback(async () => {
    if (mode !== "edit" || !task) return;
    await deleteTask.mutateAsync({ boardId: board.id, taskId: task.id });
    onClose();
  }, [mode, task, board.id, deleteTask, onClose]);

  if (!open) return null;

  const openStatusId =
    workflowOrder.find((id) => id === "open") ?? workflowOrder[0] ?? "open";
  const inProgressId =
    workflowOrder.find((id) => id === "in-progress") ?? "in-progress";

  const currentMeta = task
    ? statuses?.find((s) => s.id === task.status)
    : undefined;
  const isDone =
    currentMeta?.isClosed ?? (task?.status === closedStatusId);
  const isInProgress = task?.status === inProgressId;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onClick={busy ? undefined : requestClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={dialogRef}
          tabIndex={-1}
          // Dialogs opt back into selection so text fields work normally above the board's select-none surface.
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {mode === "create" ? "New task" : "Edit task"}
          </h2>

          <div className="mt-4 space-y-3">
            {emojiFieldError ? (
              <p className="text-sm text-destructive" role="alert">
                {emojiFieldError}
              </p>
            ) : null}
            <div>
              <label htmlFor={`${titleId}-title`} className="text-xs font-medium text-muted-foreground">
                Title
              </label>
              <div className="mt-1 flex gap-2">
                <EmojiPickerMenuButton
                  emoji={emoji}
                  disabled={busy}
                  onValidationError={setEmojiFieldError}
                  chooseAriaLabel="Choose task emoji"
                  selectedAriaLabel={(e) => `Task emoji ${e}`}
                  onPick={(next) => {
                    setEmojiFieldError(null);
                    setEmoji(next);
                  }}
                />
                <input
                  id={`${titleId}-title`}
                  ref={titleInputRef}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text"
                  value={title}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${titleId}-body`} className="text-xs font-medium text-muted-foreground">
                Body
              </label>
              <textarea
                id={`${titleId}-body`}
                rows={6}
                className="mt-1 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text"
                value={body}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${titleId}-group`} className="text-xs font-medium text-muted-foreground">
                Group
              </label>
              <select
                id={`${titleId}-group`}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text"
                value={group}
                disabled={busy}
                onChange={(e) => setGroup(e.target.value)}
              >
                {sortTaskGroupsForDisplay(board.taskGroups).map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {formatGroupDisplayLabel(g)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${titleId}-priority`} className="text-xs font-medium text-muted-foreground">
                Priority
              </label>
              <select
                id={`${titleId}-priority`}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text"
                value={priority}
                disabled={busy}
                onChange={(e) => setPriority(e.target.value)}
              >
                {sortedPriorities.map((taskPriority) => (
                  <option key={taskPriority.id} value={String(taskPriority.id)}>
                    {taskPriority.value} - {priorityDisplayLabel(taskPriority.label)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${titleId}-release`} className="text-xs font-medium text-muted-foreground">
                Release
              </label>
              <select
                id={`${titleId}-release`}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text"
                value={release}
                disabled={busy}
                onChange={(e) => setRelease(e.target.value)}
              >
                {mode === "create" ? (
                  <option value={RELEASE_SELECT_AUTO}>
                    Auto (board default when enabled)
                  </option>
                ) : null}
                <option value={RELEASE_SELECT_NONE}>Untagged</option>
                {board.releases.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {mode === "edit" && task ? (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Workflow
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                    disabled={busy || isDone}
                    onClick={() => void applyWorkflowStatus(closedStatusId)}
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                    disabled={busy || !isDone}
                    onClick={() => void applyWorkflowStatus(openStatusId)}
                  >
                    Re-open
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                    disabled={busy || isInProgress}
                    onClick={() => void applyWorkflowStatus(inProgressId)}
                  >
                    Set In-Progress
                  </button>
                </div>
                {isDone && task.closedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Completed{" "}
                    {new Date(task.closedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            {mode === "edit" && (
              <button
                type="button"
                className="mr-auto rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                disabled={busy}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Move to Trash
              </button>
            )}
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <DiscardChangesDialog
        open={showDiscard}
        onCancel={() => setShowDiscard(false)}
        onDiscard={() => {
          setShowDiscard(false);
          onClose();
        }}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        scope="task-delete-confirmation"
        title="Move this task to Trash?"
        message="You can restore it from Trash or delete it permanently there."
        confirmLabel="Move to Trash"
        cancelLabel="Cancel"
        variant="destructive"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          void runDelete();
        }}
      />
    </>
  );
}
