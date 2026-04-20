import {
  memo,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Bot, Check, Clock } from "lucide-react";
import {
  NONE_TASK_PRIORITY_VALUE,
  priorityDisplayLabel,
  formatTaskIdForDisplay,
  taskDisplayTitleOnCard,
  type Board,
  type Task,
  type TaskPriorityDefinition,
  type TaskStatus,
} from "../../../shared/models";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import {
  getTaskCardViewSpec,
  type TaskCardViewMode,
} from "@/store/preferences";
import { cn } from "@/lib/utils";
import {
  formatTaskCardDateTooltip,
  getTaskCardRelativeDateParts,
  getTaskCardTimeline,
} from "@/lib/taskCardDate";
import { clampTaskTitleInput } from "../../../shared/taskTitle";
import type { TaskCardOverflowBoardData } from "@/components/board/boardColumnData";
import { TaskCardOverflowMenu } from "@/components/task/TaskCardOverflowMenu";

function taskCardBodyPaddingClass(viewMode: TaskCardViewMode): string {
  return viewMode === "small" ? "px-2 py-2" : "px-2.5 py-2";
}

/** Inline title edit controls for `TaskCard` — set only while that row is editing. */
export interface TaskCardInlineEdit {
  draft: string;
  setDraft: (value: string) => void;
  commit: () => void;
  cancel: () => void;
  busy?: boolean;
}

/**
 * Builds `inlineEdit` when `editingTaskId` matches `taskId`; keeps call sites from
 * repeating the same field bundle (see composition-patterns review #10).
 */
export function taskCardInlineEditFor(
  taskId: number,
  editingTaskId: number | null,
  draft: string,
  actions: {
    setDraft: (value: string) => void;
    commit: () => void;
    cancel: () => void;
    busy: boolean;
  },
): TaskCardInlineEdit | undefined {
  if (editingTaskId !== taskId) return undefined;
  return {
    draft,
    setDraft: actions.setDraft,
    commit: actions.commit,
    cancel: actions.cancel,
    busy: actions.busy,
  };
}

function previewBody(body: string, max = 100): string {
  const plain = body.replace(/\s+/g, " ").trim();
  if (!plain) return "";
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

function autoSizeInlineTitleTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  textarea.style.height = "auto";
  const computed = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
  const paddingY =
    (Number.parseFloat(computed.paddingTop) || 0) +
    (Number.parseFloat(computed.paddingBottom) || 0);
  const borderY =
    (Number.parseFloat(computed.borderTopWidth) || 0) +
    (Number.parseFloat(computed.borderBottomWidth) || 0);
  const maxHeight = lineHeight * 3 + paddingY + borderY;
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function statusAriaLabel(status: TaskStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "in-progress":
      return "In progress";
    case "closed":
      return "Closed";
    default:
      return status || "Status";
  }
}

function OpenStatusCircle() {
  return (
    <span
      className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span className="size-3.5 rounded-full border-2 border-muted-foreground/55 bg-transparent" />
    </span>
  );
}

function TaskStatusIndicator({ status }: { status: TaskStatus }) {
  const label = statusAriaLabel(status);
  return (
    <span
      className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center"
      aria-hidden
    >
      {status === "open" ? (
        <span
          className="size-3.5 rounded-full border-2 border-muted-foreground/55 bg-transparent"
          title={label}
        />
      ) : null}
      {status === "in-progress" ? (
        <span
          className="size-3.5 rounded-full bg-amber-400 shadow-sm dark:bg-amber-500"
          title={label}
        />
      ) : null}
      {status === "closed" ? (
        <span
          className="flex size-3.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm dark:bg-emerald-600"
          title={label}
        >
          <Check className="size-2.5 stroke-[3]" aria-hidden />
        </span>
      ) : null}
      {status !== "open" &&
      status !== "in-progress" &&
      status !== "closed" ? (
        <span
          className="size-3.5 rounded-full bg-muted-foreground/35"
          title={label}
        />
      ) : null}
    </span>
  );
}

interface TaskCardProps {
  task: Task;
  taskPriorities: TaskPriorityDefinition[];
  viewMode: TaskCardViewMode;
  /** Display label for `task.groupId` (resolved from board definitions). */
  groupLabel: string;
  /** Optional release chip (same styling as priority when color is set). */
  releasePill?: { label: string; color?: string | null } | null;
  onOpen: () => void;
  /** When set, render the inline title editor instead of the static title. */
  inlineEdit?: TaskCardInlineEdit;
  /** When set, only for `open` tasks: click the empty circle to complete (does not open the editor). */
  onCompleteFromCircle?: (anchorEl: HTMLElement) => void;
  /** When true, dim the card to indicate it's being dragged. */
  isDragging?: boolean;
  /**
   * When false (default), this card registers its root for keyboard scroll targeting.
   * SortableTaskRow sets true so only the row wrapper registers once per task.
   */
  skipNavRegistration?: boolean;
  /**
   * When false, no right-slot overflow menu (e.g. drag overlay clone should not expose actions).
   */
  showOverflowMenu?: boolean;
  /** Board metadata for overflow quick actions (release / priority / group). */
  overflowActionsBoard?: TaskCardOverflowBoardData;
}

/** Shown when the task was created by the CLI principal (Phase 2 provenance). */
function CliCreatedIndicator({
  task,
  compact,
}: {
  task: Task;
  /** Smaller icon for dense / small card layout. */
  compact?: boolean;
}) {
  if (task.createdByPrincipal !== "cli") return null;
  const tip =
    task.createdByLabel?.trim() || "Created via hirotm CLI";
  return (
    <span
      className="inline-flex shrink-0 text-muted-foreground"
      title={tip}
      aria-label={tip}
    >
      <Bot
        className={compact ? "size-3" : "size-3.5"}
        strokeWidth={2}
        aria-hidden
      />
    </span>
  );
}

/** Light priority swatches need a border so the pill stays visible on light card backgrounds. */
function isVeryLightPriorityBackground(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c === "#ffffff" || c === "#fff" || c === "white";
}

/** Resolved release label/color for a task, or null when unassigned / unknown id. */
export function taskReleasePill(
  board: Pick<Board, "releases">,
  task: Pick<Task, "releaseId">,
): { label: string; color?: string | null } | null {
  const rid = task.releaseId;
  if (rid == null) return null;
  const r = board.releases.find((x) => x.releaseId === rid);
  if (!r) return null;
  return { label: r.name, color: r.color };
}

/** Bold “r” + space before release name in chips (priority pills stay unchanged). */
function ReleaseChipPrefix(): ReactNode {
  return (
    <>
      <span className="font-bold">r&nbsp;&nbsp;</span>
    </>
  );
}

function releaseChipTitle(label: string): string {
  return `r ${label.trim()}`;
}

/**
 * Open/created vs closed timestamp for large/larger task cards.
 * Returns a bare `<span>` — the caller decides placement (metadata row, inline after preview, etc.).
 */
function TaskCardTimelineChip({
  task,
  className,
}: {
  task: Task;
  className?: string;
}) {
  const timeline = getTaskCardTimeline(task);
  if (!timeline) return null;
  const { label: compact, showRecentDot } = getTaskCardRelativeDateParts(timeline.iso);
  if (!compact) return null;
  const tip = formatTaskCardDateTooltip(timeline.kind, timeline.iso);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/80",
        className,
      )}
      title={tip}
      aria-label={tip}
    >
      {showRecentDot ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400"
          aria-hidden
        />
      ) : (
        <Clock className="size-2.5 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
      )}
      {compact}
    </span>
  );
}

function PriorityPill({
  label,
  color,
  prefixNode,
}: {
  label: string;
  color: string;
  /** Rendered before the display label (not passed through `priorityDisplayLabel`). */
  prefixNode?: ReactNode;
}) {
  const displayLabel = priorityDisplayLabel(label);
  if (!displayLabel) return null;
  const light = isVeryLightPriorityBackground(color);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        light
          ? "border border-border/70 text-foreground"
          : "text-black/85",
      )}
      title={prefixNode != null ? releaseChipTitle(label) : label}
      style={{
        backgroundColor: color,
      }}
    >
      {prefixNode}
      {displayLabel}
    </span>
  );
}

/**
 * Content section shared by both open and non-open card layouts.
 * Extracted so the two branches render identical markup for the text area.
 */
function TaskCardContent({
  task,
  taskPriorities,
  viewMode,
  groupLabel,
  releasePill,
  preview,
  onOpen,
  inlineEdit,
}: {
  task: Task;
  taskPriorities: TaskPriorityDefinition[];
  viewMode: TaskCardViewMode;
  groupLabel: string;
  releasePill?: { label: string; color?: string | null } | null;
  preview: string;
  onOpen: () => void;
  inlineEdit?: TaskCardInlineEdit;
}) {
  const viewSpec = getTaskCardViewSpec(viewMode);
  const priorityRow = taskPriorities.find((p) => p.priorityId === task.priorityId);
  // Default builtin `none` is not surfaced as a chip (same UX as “no priority”).
  const showPriorityPill =
    priorityRow != null && priorityRow.value !== NONE_TASK_PRIORITY_VALUE;
  const showReleasePill =
    releasePill != null && releasePill.label.trim().length > 0;
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const titleBlurModeRef = useRef<"commit" | "cancel">("commit");

  const isEditing = inlineEdit != null;
  useLayoutEffect(() => {
    if (!isEditing) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
    titleBlurModeRef.current = "commit";
  }, [isEditing, task.taskId]);

  useLayoutEffect(() => {
    if (!inlineEdit) return;
    autoSizeInlineTitleTextarea(titleInputRef.current);
  }, [isEditing, inlineEdit?.draft]);

  return (
    <div
      className="min-w-0 flex-1 text-left"
      onClick={inlineEdit ? undefined : onOpen}
    >
      {inlineEdit ? (
        <div className="flex min-w-0 gap-1.5">
          {task.emoji ? (
            <span
              className="shrink-0 text-lg leading-tight"
              aria-hidden
            >
              {task.emoji}
            </span>
          ) : null}
          {/* Inline rename auto-fits up to three lines without reselecting text while typing. */}
          <textarea
            ref={titleInputRef}
            rows={3}
            className={cn(
              "min-w-0 flex-1 resize-y rounded border border-input bg-background px-2 py-1 text-foreground select-text",
              viewSpec.titleClassName,
            )}
            value={inlineEdit.draft}
            disabled={inlineEdit.busy}
            onChange={(e) => {
              // Auto-grow up to three lines, then keep the native resize handle available.
              autoSizeInlineTitleTextarea(e.currentTarget);
              inlineEdit.setDraft(clampTaskTitleInput(e.target.value));
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              if (titleBlurModeRef.current === "cancel") {
                titleBlurModeRef.current = "commit";
                return;
              }
              inlineEdit.commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                inlineEdit.commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                titleBlurModeRef.current = "cancel";
                inlineEdit.cancel();
              }
            }}
          />
        </div>
      ) : (
        <div
          className={cn(
            "flex min-w-0 items-start gap-1.5",
            viewMode === "small" && "items-center",
          )}
        >
          <div
            className={cn(
              "min-w-0 flex-1 font-medium",
              viewSpec.titleClassName,
              task.status === "closed" &&
                "line-through decoration-foreground/35 decoration-[2px]",
            )}
          >
            {taskDisplayTitleOnCard(task)}
          </div>
          {viewMode === "small" ? (
            <CliCreatedIndicator task={task} compact />
          ) : null}
        </div>
      )}
      {viewMode !== "small" ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="uppercase tracking-wide text-muted-foreground/80">
            {groupLabel}
          </span>
          {showPriorityPill && priorityRow ? (
            <PriorityPill label={priorityRow.label} color={priorityRow.color} />
          ) : null}
          {showReleasePill && releasePill?.color ? (
            <PriorityPill
              label={releasePill.label}
              color={releasePill.color}
              prefixNode={<ReleaseChipPrefix />}
            />
          ) : showReleasePill ? (
            <span
              className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              title={releaseChipTitle(releasePill!.label)}
            >
              <ReleaseChipPrefix />
              {releasePill!.label}
            </span>
          ) : null}
          {viewMode === "large" || viewMode === "larger" ? (
            <span
              className="text-muted-foreground/55"
              title={`Task id ${formatTaskIdForDisplay(task.taskId)}`}
            >
              #{formatTaskIdForDisplay(task.taskId)}
            </span>
          ) : null}
          <CliCreatedIndicator task={task} />
          {/* Date chip in metadata row when there is no preview body below (large mode). */}
          {!preview && (viewMode === "large" || viewMode === "larger") ? (
            <TaskCardTimelineChip task={task} className="ml-auto" />
          ) : null}
        </div>
      ) : null}
      {/* Larger mode: preview body + date at bottom-right.
          An invisible inline spacer reserves room on the last text line;
          when text fills that line the spacer wraps, creating vertical space.
          The date is absolutely positioned at bottom-right over the spacer.
          No line-clamp here — JS truncation (previewBody) controls length,
          avoiding the double-ellipsis caused by CSS clamp + JS "…". */}
      {preview && (viewMode === "large" || viewMode === "larger") ? (
        <p className="relative mt-1 text-xs text-muted-foreground">
          {preview}
          {getTaskCardTimeline(task) != null ? (
            <>
              {/* Reserve width for clock + longest relative labels (e.g. “3 days ago”). */}
              <span
                className="inline-block h-4 w-24 select-none align-bottom"
                aria-hidden
              >
                {"\u00A0"}
              </span>
              <TaskCardTimelineChip
                task={task}
                className="absolute bottom-0 right-0"
              />
            </>
          ) : null}
        </p>
      ) : preview ? (
        <div
          className={cn(
            "mt-1 text-xs text-muted-foreground",
            viewSpec.previewClassName,
          )}
        >
          {preview}
        </div>
      ) : null}
    </div>
  );
}

const TASK_CARD_INLINE_PADDING_REM = 0.625;
const TASK_CARD_STATUS_SLOT_REM = 1.375;
/** Width reserved for the hover-only overflow control; horizontal padding sits inside this slot. */
const TASK_CARD_RIGHT_SLOT_REM = 1.0;

function taskCardLayoutCssVars(
  viewMode: TaskCardViewMode,
  rightSlotRem: number,
): CSSProperties {
  const inlinePaddingRem = viewMode === "small" ? 0.5 : TASK_CARD_INLINE_PADDING_REM;
  const blockPaddingRem = viewMode === "small" ? 0.375 : 0.5;
  return {
    // Keep the movement distance and content width derived from the same slots
    // so view-mode changes do not expose part of the hidden open circle or shift it vertically.
    ["--task-card-inline-padding" as string]: `${inlinePaddingRem}rem`,
    ["--task-card-block-padding" as string]: `${blockPaddingRem}rem`,
    ["--task-card-status-slot" as string]: `${TASK_CARD_STATUS_SLOT_REM}rem`,
    ["--task-card-right-slot" as string]: `${rightSlotRem}rem`,
  };
}

function openTaskInnerRailWidthStyle(): CSSProperties {
  return {
    width:
      "calc(100% - var(--task-card-status-slot) - var(--task-card-right-slot))",
  };
}

// Memoized to avoid re-rendering every card on each drag-over event
export const TaskCard = memo(function TaskCard({
  task,
  taskPriorities,
  viewMode,
  groupLabel,
  releasePill = null,
  onOpen,
  inlineEdit,
  onCompleteFromCircle,
  isDragging,
  skipNavRegistration = false,
  showOverflowMenu = true,
  overflowActionsBoard,
}: TaskCardProps) {
  const nav = useBoardKeyboardNavOptional();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewSpec = getTaskCardViewSpec(viewMode);

  useLayoutEffect(() => {
    if (skipNavRegistration || !nav) return;
    const el = rootRef.current;
    if (el) nav.registerTaskElement(task.taskId, el);
    return () => {
      nav.registerTaskElement(task.taskId, null);
    };
  }, [nav, skipNavRegistration, task.taskId]);

  const preview = viewSpec.showDescriptionPreview
    ? previewBody(task.body, viewSpec.previewMaxLength)
    : "";
  const canCompleteFromCircle =
    task.status === "open" && onCompleteFromCircle !== undefined;
  const isOpenTask = task.status === "open";
  const bodyPaddingClass = taskCardBodyPaddingClass(viewMode);
  const rightSlotRem =
    showOverflowMenu && inlineEdit == null && !isDragging
      ? TASK_CARD_RIGHT_SLOT_REM
      : 0;
  const layoutVars = taskCardLayoutCssVars(viewMode, rightSlotRem);

  return (
    <div
      ref={rootRef}
      data-task-card-root
      data-task-id={task.taskId}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || skipNavRegistration || !nav) return;
        nav.setHoveredTaskId(task.taskId);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse" || skipNavRegistration || !nav) return;
        nav.setHoveredTaskId(null);
      }}
      onPointerDown={() => {
        if (inlineEdit != null) return;
        // Clicking into a task should make it current before any editor/dialog opens.
        nav?.selectTask(task.taskId);
      }}
      className={cn(
        "group/task-card relative w-full overflow-hidden rounded-md border border-border bg-task-card text-sm text-task-card-foreground shadow-sm transition-colors select-none",
        "hover:bg-accent/45",
        task.color && "border-l-4",
        isDragging && "opacity-40",
      )}
      style={{
        ...layoutVars,
        ...(task.color ? { borderLeftColor: task.color } : undefined),
      }}
    >
      {isOpenTask ? (
        <>
          <div
            className={cn("relative", bodyPaddingClass)}
            style={openTaskInnerRailWidthStyle()}
          >
            {canCompleteFromCircle ? (
              <button
                type="button"
                data-task-complete-button
                className={cn(
                  "absolute left-[var(--task-card-inline-padding)] top-[var(--task-card-block-padding)] inline-flex w-[var(--task-card-status-slot)] items-start justify-start rounded-sm opacity-0 outline-none transition-opacity duration-150 ring-offset-background pointer-events-none group-hover/task-card:pointer-events-auto group-hover/task-card:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
                )}
                aria-label="Mark complete"
                title="Mark complete"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // Completing from the card is still a task interaction, so keep
                  // this task current before applying the status change.
                  nav?.selectTask(task.taskId);
                  onCompleteFromCircle(e.currentTarget);
                }}
              >
                <OpenStatusCircle />
              </button>
            ) : (
              <div className="absolute left-[var(--task-card-inline-padding)] top-[var(--task-card-block-padding)] inline-flex w-[var(--task-card-status-slot)] items-start justify-start">
                <TaskStatusIndicator status={task.status} />
              </div>
            )}
            <div
              className={cn(
                "min-w-0 translate-x-0 transition-transform duration-150 ease-out group-hover/task-card:translate-x-[var(--task-card-status-slot)]",
              )}
            >
              <TaskCardContent
                task={task}
                taskPriorities={taskPriorities}
                viewMode={viewMode}
                groupLabel={groupLabel}
                releasePill={releasePill}
                preview={preview}
                onOpen={onOpen}
                inlineEdit={inlineEdit}
              />
            </div>
          </div>
          {rightSlotRem > 0 ? (
            <div
              className={cn(
                "pointer-events-none absolute top-[var(--task-card-block-padding)] right-[var(--task-card-inline-padding)] z-[1]",
                "flex w-[var(--task-card-right-slot)] items-start justify-center",
              )}
            >
              {/* Nested wrapper: menu trigger enables pointer-events so the row stays draggable. */}
              <div className="pointer-events-auto">
                <TaskCardOverflowMenu
                  task={task}
                  board={overflowActionsBoard}
                  onEdit={onOpen}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        // Non-open tasks: normal flex layout with status always visible.
        <div className={cn("flex items-start gap-2", bodyPaddingClass)}>
          <div className="shrink-0">
            <TaskStatusIndicator status={task.status} />
          </div>
          <TaskCardContent
            task={task}
            taskPriorities={taskPriorities}
            viewMode={viewMode}
            groupLabel={groupLabel}
            releasePill={releasePill}
            preview={preview}
            onOpen={onOpen}
            inlineEdit={inlineEdit}
          />
          {rightSlotRem > 0 ? (
            <div className="flex w-[var(--task-card-right-slot)] shrink-0 justify-center">
              <TaskCardOverflowMenu
                task={task}
                board={overflowActionsBoard}
                onEdit={onOpen}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});
