import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBlocker } from "react-router-dom";
import { Star } from "lucide-react";
import type { RefMDEditor } from "@uiw/react-md-editor";
import {
  formatGroupDisplayLabel,
  formatTaskIdForDisplay,
  priorityDisplayLabel,
  sortPrioritiesByValue,
  sortTaskGroupsForDisplay,
  type Task,
} from "../../../shared/models";
import { sortReleasesForDisplay } from "../../../shared/releaseSort";
import { clampTaskTitleInput } from "../../../shared/taskTitle";
import type { TaskEditorBoardData } from "@/components/board/boardColumnData";
import { useDeleteTask, useUpdateTask } from "@/api/mutations";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { TaskFieldSwatchSelect } from "@/components/task/TaskFieldSwatchSelect";
import { ConfirmDialog } from "@/components/board/shortcuts/ConfirmDialog";
import { DiscardChangesDialog } from "@/components/board/shortcuts/DiscardChangesDialog";
import { useShortcutOverlay } from "@/components/board/shortcuts/ShortcutScopeContext";
import { useBackdropDismissClick } from "@/components/board/shortcuts/useBackdropDismissClick";
import { useDialogCloseRequest } from "@/components/board/shortcuts/useDialogCloseRequest";
import { useBodyScrollLock } from "@/components/board/shortcuts/bodyScrollLock";
import {
  MODAL_BACKDROP_SURFACE_CLASS,
  MODAL_DIALOG_OVERSCROLL_CLASS,
  MODAL_TEXT_FIELD_CURSOR_CLASS,
} from "@/components/board/shortcuts/modalOverlayClasses";
import { useModalFocusTrap } from "@/components/board/shortcuts/useModalFocusTrap";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";
import { resolveDark, useSystemDark } from "@/components/layout/ThemeRoot";
import { usePreferencesStore } from "@/store/preferences";
import { createTaskMarkdownPreviewComponents } from "@/components/task/taskMarkdownPreviewComponents";
import { TaskTitleCharsLeft } from "@/components/task/TaskTitleCharsLeft";

const TaskMarkdownField = lazy(() =>
  import("@/components/task/TaskMarkdownField").then((m) => ({
    default: m.TaskMarkdownField,
  })),
);
import {
  RELEASE_SELECT_AUTO,
  RELEASE_SELECT_NONE,
  useTaskEditorForm,
} from "@/components/task/useTaskEditorForm";
import { statusDotClass } from "@/components/board/lanes/laneStatusTheme";
import {
  formatDateMedium,
  formatDateTimeMediumShort,
} from "@/lib/intlDateFormat";
import { cn } from "@/lib/utils";

/**
 * Release date shown beside the name in the task editor (muted segment; `TaskFieldSwatchSelect` `dateLabel`).
 * Returns undefined when unset or unparseable so no stray punctuation appears next to dotted release names.
 */
function formatReleaseDateLabelForSelect(
  releaseDate: string | null | undefined,
): string | undefined {
  const raw = releaseDate?.trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return formatDateMedium(d);
}

/** Main-field tab order; MD toolbar buttons are pushed out of the tab order via `TaskMarkdownField`. */
const TASK_FIELD_TAB = {
  emoji: 1,
  title: 2,
  body: 3,
  group: 4,
  priority: 5,
  releaseUseDefault: 6,
  release: 7,
  save: 8,
  cancel: 9,
  moveToTrash: 10,
} as const;

interface TaskEditorProps {
  board: TaskEditorBoardData;
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  /** Required when mode is create */
  createContext?: { listId: number; status: string };
  task?: Task | null;
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
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const { data: statuses } = useStatuses();
  const workflowOrder = useStatusWorkflowOrder();
  const completion = useBoardTaskCompletionCelebrationOptional();
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const systemDark = useSystemDark();
  // `@uiw/react-md-editor` ships separate light/dark surfaces; keep in sync with app theme preference.
  const mdColorMode = resolveDark(themePreference, systemDark) ? "dark" : "light";
  const markdownPreviewComponents = useMemo(
    () => createTaskMarkdownPreviewComponents(mdColorMode),
    [mdColorMode],
  );

  const {
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
  } = useTaskEditorForm({
    board,
    open,
    mode,
    createContext,
    task,
    onClose,
  });

  const titleInputRef = useRef<HTMLInputElement>(null);
  const mdEditorRef = useRef<RefMDEditor>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const taskMdEditorWrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [emojiFieldError, setEmojiFieldError] = useState<string | null>(null);
  const [titleInputFocused, setTitleInputFocused] = useState(false);

  useEffect(() => {
    if (open) setEmojiFieldError(null);
  }, [open]);

  useEffect(() => {
    if (!open) setTitleInputFocused(false);
  }, [open]);

  const busy =
    createTask.isPending ||
    updateTask.isPending ||
    deleteTask.isPending ||
    (mode === "edit" && taskDetailQuery.isPending);

  const shouldBlockNavigation = open && isDirty && !busy;
  const navigatorBlocker = useBlocker(shouldBlockNavigation);

  useEffect(() => {
    if (navigatorBlocker.state === "blocked") {
      setShowDiscard(true);
    }
  }, [navigatorBlocker.state]);

  useEffect(() => {
    if (!shouldBlockNavigation) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldBlockNavigation]);

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
    initialFocusRef: mode === "create" ? titleInputRef : bodyTextareaRef,
    // MDEditor wires `textarea` after mount; retry when fetch state flips (avoid `body.length`
    // or we would re-steal focus while the user edits another field).
    initialFocusRetryKey:
      mode === "edit" && task
        ? `${task.taskId}-${taskDetailQuery.isPending}`
        : 0,
  });

  const backdropDismiss = useBackdropDismissClick(requestClose, { disabled: busy });

  useBodyScrollLock(open);

  const closedStatusId =
    statuses?.find((s) => s.isClosed)?.statusId ?? "closed";
  const sortedPriorities = useMemo(
    () => sortPrioritiesByValue(board.taskPriorities),
    [board.taskPriorities],
  );

  const prioritySelectOptions = useMemo(
    () =>
      sortedPriorities.map((p) => ({
        value: String(p.priorityId),
        label: priorityDisplayLabel(p.label),
        fillColor: p.color,
      })),
    [sortedPriorities],
  );

  const groupSelectOptions = useMemo(
    () =>
      sortTaskGroupsForDisplay(board.taskGroups).map((g) => ({
        value: String(g.groupId),
        label: formatGroupDisplayLabel(g),
      })),
    [board.taskGroups],
  );

  const releaseSelectOptions = useMemo(() => {
    const unassignedOption = {
      value: RELEASE_SELECT_NONE,
      label: "Unassigned",
      fillColor: null as string | null,
    };
    // Match header release filter: latest dated first, undated last (alphabetical among undated).
    const releaseRows = sortReleasesForDisplay(board.releases).map((r) => {
      const name = r.name.trim() || String(r.releaseId);
      const isDefault =
        board.defaultReleaseId != null && board.defaultReleaseId === r.releaseId;
      const dateLabel = formatReleaseDateLabelForSelect(r.releaseDate);
      return {
        value: String(r.releaseId),
        label: name,
        ...(dateLabel != null ? { dateLabel } : {}),
        fillColor: r.color ?? null,
        boardDefault: isDefault,
      };
    });
    if (mode === "create") {
      return [
        {
          value: RELEASE_SELECT_AUTO,
          label: "Auto (board default when enabled)",
          fillColor: null as string | null,
        },
        ...releaseRows,
        unassignedOption,
      ];
    }
    return [...releaseRows, unassignedOption];
  }, [board.releases, board.defaultReleaseId, mode]);

  const boardHasResolvableDefaultRelease = useMemo(
    () =>
      board.defaultReleaseId != null &&
      board.releases.some((r) => r.releaseId === board.defaultReleaseId),
    [board.defaultReleaseId, board.releases],
  );

  const isReleaseOnBoardDefault = useMemo(() => {
    if (board.defaultReleaseId == null || !boardHasResolvableDefaultRelease) {
      return false;
    }
    return release === String(board.defaultReleaseId);
  }, [
    board.defaultReleaseId,
    boardHasResolvableDefaultRelease,
    release,
  ]);

  const applyBoardDefaultRelease = useCallback(() => {
    if (board.defaultReleaseId == null) return;
    if (!board.releases.some((r) => r.releaseId === board.defaultReleaseId)) {
      return;
    }
    setRelease(String(board.defaultReleaseId));
  }, [board.defaultReleaseId, board.releases, setRelease]);

  const applyWorkflowStatus = useCallback(
    async (nextStatusId: string) => {
      if (mode !== "edit" || !task) return;
      const target = statuses?.find((s) => s.statusId === nextStatusId);
      const now = new Date().toISOString();
      const isClosing =
        target?.isClosed === true ||
        (target === undefined && nextStatusId === closedStatusId);
      const wasClosed =
        statuses?.find((s) => s.statusId === task.status)?.isClosed === true;
      if (isClosing && !wasClosed) {
        completion?.celebrateTaskCompletion({
          anchorEl: dialogRef.current ?? undefined,
        });
      }
      // Merge form state (title/body/…) so workflow transitions do not persist a stale board snapshot.
      const merged = buildEditTaskFromForm();
      const nextClosedAt = isClosing ? (merged.closedAt ?? now) : null;
      await updateTask.mutateAsync({
        boardId: board.boardId,
        task: {
          ...merged,
          status: nextStatusId,
          updatedAt: now,
          closedAt: nextClosedAt,
        },
      });
    },
    [
      mode,
      task,
      statuses,
      board.boardId,
      updateTask,
      closedStatusId,
      completion,
      buildEditTaskFromForm,
    ],
  );

  const runDelete = useCallback(async () => {
    if (mode !== "edit" || !task) return;
    await deleteTask.mutateAsync({ boardId: board.boardId, taskId: task.taskId });
    onClose();
  }, [mode, task, board.boardId, deleteTask, onClose]);

  const openStatusId =
    workflowOrder.find((id) => id === "open") ?? workflowOrder[0] ?? "open";
  const inProgressId =
    workflowOrder.find((id) => id === "in-progress") ?? "in-progress";

  const currentMeta = task
    ? statuses?.find((s) => s.statusId === task.status)
    : undefined;
  const isDone =
    currentMeta?.isClosed ?? (task?.status === closedStatusId);
  const isInProgress = task?.status === inProgressId;

  /** Which of the three workflow bands the task is in — drives the two transition buttons (the “other” states). */
  const workflowBucket = !task
    ? null
    : isDone
      ? ("closed" as const)
      : isInProgress
        ? ("in-progress" as const)
        : ("open" as const);

  // Must stay above `if (!open) return null` — hooks cannot run conditionally when the overlay opens.
  const otherWorkflowTargetIds = useMemo((): [string, string] | null => {
    if (!workflowBucket) return null;
    if (workflowBucket === "closed") {
      return [openStatusId, inProgressId];
    }
    if (workflowBucket === "open") {
      return [closedStatusId, inProgressId];
    }
    return [closedStatusId, openStatusId];
  }, [workflowBucket, openStatusId, inProgressId, closedStatusId]);

  const statusLabelFor = useCallback(
    (statusId: string) =>
      statuses?.find((s) => s.statusId === statusId)?.label ?? statusId,
    [statuses],
  );

  if (!open) return null;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",
          MODAL_BACKDROP_SURFACE_CLASS,
        )}
        role="presentation"
        onPointerDown={backdropDismiss.onPointerDown}
        onClick={backdropDismiss.onClick}
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={dialogRef}
          tabIndex={-1}
          // Dialogs opt back into selection so text fields work normally above the board's select-none surface.
          // Reset inherited `cursor-grab` from `#board` / scroll chaining into lists behind the modal.
          className={cn(
            "max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text",
            MODAL_DIALOG_OVERSCROLL_CLASS,
            MODAL_TEXT_FIELD_CURSOR_CLASS,
            "[&_.w-md-editor-text]:cursor-text",
          )}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {mode === "create"
              ? "New task"
              : task != null
                ? `Edit task #${formatTaskIdForDisplay(task.taskId)}`
                : "Edit task"}
          </h2>

          <div className="mt-4 space-y-4">
            {emojiFieldError ? (
              <p className="text-sm text-destructive" role="alert">
                {emojiFieldError}
              </p>
            ) : null}

            {/* Header: emoji + title + current status (read-only); counter below title only (reserved row so the title line does not shift on focus). */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                <EmojiPickerMenuButton
                  emoji={emoji}
                  disabled={busy}
                  onValidationError={setEmojiFieldError}
                  chooseAriaLabel="Choose task emoji"
                  selectedAriaLabel={(e) => `Task emoji ${e}`}
                  triggerTabIndex={TASK_FIELD_TAB.emoji}
                  onPick={(next) => {
                    setEmojiFieldError(null);
                    setEmoji(next);
                  }}
                />
                <div className="min-w-0 flex-1 basis-[min(100%,16rem)]">
                  <label htmlFor={`${titleId}-title`} className="sr-only">
                    Title
                  </label>
                  <input
                    id={`${titleId}-title`}
                    ref={titleInputRef}
                    tabIndex={TASK_FIELD_TAB.title}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text"
                    value={title}
                    disabled={busy}
                    placeholder="Title"
                    onChange={(e) => setTitle(clampTaskTitleInput(e.target.value))}
                    onFocus={() => setTitleInputFocused(true)}
                    onBlur={() => setTitleInputFocused(false)}
                  />
                  {/* Reserve the counter line height so focus/blur does not shift the title input; invisible copy matches metrics. */}
                  <div className="mt-1 flex min-h-[1.25rem] items-center">
                    {titleInputFocused ? (
                      <TaskTitleCharsLeft value={title} />
                    ) : (
                      <span
                        className="invisible text-xs tabular-nums"
                        aria-hidden
                      >
                        00 Chrs Left
                      </span>
                    )}
                  </div>
                </div>
                {mode === "edit" && task ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-sm text-foreground"
                    title="Current workflow status"
                  >
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full border border-black",
                        statusDotClass(task.status),
                      )}
                      aria-hidden
                    />
                    <span>{currentMeta?.label ?? task.status}</span>
                  </span>
                ) : null}
                {mode === "create" && createContext ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-sm text-foreground"
                    title="Initial workflow status when created"
                  >
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full border border-black",
                        statusDotClass(createContext.status),
                      )}
                      aria-hidden
                    />
                    <span>
                      {statuses?.find((s) => s.statusId === createContext.status)
                        ?.label ?? createContext.status}
                    </span>
                  </span>
                ) : null}
              </div>

              {mode === "edit" && task && otherWorkflowTargetIds ? (
                <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
                  {otherWorkflowTargetIds.map((targetId) => (
                    <button
                      key={targetId}
                      type="button"
                      tabIndex={-1}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                      disabled={busy}
                      onClick={() => void applyWorkflowStatus(targetId)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-2.5 shrink-0 rounded-full border border-black",
                            statusDotClass(targetId),
                          )}
                          aria-hidden
                        />
                        <span>{statusLabelFor(targetId)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {mode === "edit" && task && isDone && task.closedAt ? (
              <p className="text-xs text-muted-foreground">
                Completed{" "}
                {formatDateTimeMediumShort(new Date(task.closedAt))}
              </p>
            ) : null}

            {/* Default preview="live": split edit + preview; `@uiw/react-md-editor` loads with this chunk (bundle-conditional). */}
            <Suspense
              fallback={
                <div className="flex min-h-[min(50vh,22rem)] w-full items-center justify-center rounded-md border border-border bg-muted/30 px-3 py-8 text-sm text-muted-foreground">
                  Loading editor…
                </div>
              }
            >
              <TaskMarkdownField
                titleId={titleId}
                body={body}
                onBodyChange={setBody}
                disabled={busy}
                bodyTabIndex={TASK_FIELD_TAB.body}
                mdColorMode={mdColorMode}
                markdownPreviewComponents={markdownPreviewComponents}
                autoFocus={mode === "edit" && taskEditorActive}
                toolbarTabSkipEnabled={taskEditorActive}
                mdEditorRef={mdEditorRef}
                bodyTextareaRef={bodyTextareaRef}
                taskMdEditorWrapRef={taskMdEditorWrapRef}
              />
            </Suspense>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0">
                <label
                  id={`${titleId}-group-label`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Group
                </label>
                <TaskFieldSwatchSelect
                  labelId={`${titleId}-group-label`}
                  tabIndex={TASK_FIELD_TAB.group}
                  value={group}
                  options={groupSelectOptions}
                  disabled={busy}
                  showSwatch={false}
                  onChange={setGroup}
                />
              </div>
              <div className="min-w-0">
                <label
                  id={`${titleId}-priority-label`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Priority
                </label>
                <TaskFieldSwatchSelect
                  labelId={`${titleId}-priority-label`}
                  tabIndex={TASK_FIELD_TAB.priority}
                  value={priority}
                  options={prioritySelectOptions}
                  disabled={busy}
                  onChange={setPriority}
                />
              </div>
              <div className="min-w-0">
                <label
                  id={`${titleId}-release-label`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Release
                </label>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <TaskFieldSwatchSelect
                      labelId={`${titleId}-release-label`}
                      tabIndex={TASK_FIELD_TAB.release}
                      value={release}
                      options={releaseSelectOptions}
                      disabled={busy}
                      omitTriggerTopMargin
                      onChange={setRelease}
                    />
                  </div>
                  {/* Yellow star: jump the dropdown to the board default release (disabled if none or already selected). */}
                  <button
                    type="button"
                    tabIndex={TASK_FIELD_TAB.releaseUseDefault}
                    className={cn(
                      "inline-flex shrink-0 rounded-md border border-border/80 p-1.5 text-foreground",
                      "hover:bg-muted/80 disabled:pointer-events-none disabled:opacity-40",
                    )}
                    disabled={
                      busy ||
                      !boardHasResolvableDefaultRelease ||
                      isReleaseOnBoardDefault
                    }
                    title="Use board default release"
                    aria-label="Use board default release"
                    onClick={() => applyBoardDefaultRelease()}
                  >
                    <Star
                      className="size-3.5 fill-yellow-400 text-yellow-600"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            {mode === "edit" && (
              <button
                type="button"
                tabIndex={TASK_FIELD_TAB.moveToTrash}
                className="mr-auto rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                disabled={busy}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Move to Trash
              </button>
            )}
            <button
              type="button"
              tabIndex={TASK_FIELD_TAB.cancel}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              tabIndex={TASK_FIELD_TAB.save}
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
        onCancel={() => {
          setShowDiscard(false);
          if (navigatorBlocker.state === "blocked") {
            navigatorBlocker.reset();
          }
        }}
        onDiscard={() => {
          setShowDiscard(false);
          if (navigatorBlocker.state === "blocked") {
            navigatorBlocker.proceed();
          }
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
