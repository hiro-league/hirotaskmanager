import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import { Bot, Check } from "lucide-react";
import {
  NONE_TASK_PRIORITY_VALUE,
  priorityDisplayLabel,
  taskDisplayTitle,
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

function taskCardBodyPaddingClass(viewMode: TaskCardViewMode): string {
  return viewMode === "small" ? "px-2 py-2" : "px-2.5 py-2";
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
  onOpen: () => void;
  /** When true, render an inline title-only editor instead of the normal task title. */
  editingTitle?: boolean;
  titleDraft?: string;
  onTitleDraftChange?: (value: string) => void;
  onTitleCommit?: () => void;
  onTitleCancel?: () => void;
  titleEditBusy?: boolean;
  /** When set, only for `open` tasks: click the empty circle to complete (does not open the editor). */
  onCompleteFromCircle?: (anchorEl: HTMLElement) => void;
  /** When true, dim the card to indicate it's being dragged. */
  isDragging?: boolean;
  /**
   * When false (default), this card registers its root for keyboard scroll targeting.
   * SortableTaskRow sets true so only the row wrapper registers once per task.
   */
  skipNavRegistration?: boolean;
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

function PriorityPill({
  label,
  color,
}: {
  label: string;
  color: string;
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
      title={label}
      style={{
        backgroundColor: color,
      }}
    >
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
  preview,
  onOpen,
  editingTitle = false,
  titleDraft = "",
  onTitleDraftChange,
  onTitleCommit,
  onTitleCancel,
  titleEditBusy = false,
}: {
  task: Task;
  taskPriorities: TaskPriorityDefinition[];
  viewMode: TaskCardViewMode;
  groupLabel: string;
  preview: string;
  onOpen: () => void;
  editingTitle?: boolean;
  titleDraft?: string;
  onTitleDraftChange?: (value: string) => void;
  onTitleCommit?: () => void;
  onTitleCancel?: () => void;
  titleEditBusy?: boolean;
}) {
  const viewSpec = getTaskCardViewSpec(viewMode);
  const priorityRow = taskPriorities.find((p) => p.id === task.priorityId);
  // Default builtin `none` is not surfaced as a chip (same UX as “no priority”).
  const showPriorityPill =
    priorityRow != null && priorityRow.value !== NONE_TASK_PRIORITY_VALUE;
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const titleBlurModeRef = useRef<"commit" | "cancel">("commit");

  useLayoutEffect(() => {
    if (!editingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
    titleBlurModeRef.current = "commit";
  }, [editingTitle, task.id]);

  useLayoutEffect(() => {
    if (!editingTitle) return;
    autoSizeInlineTitleTextarea(titleInputRef.current);
  }, [editingTitle, titleDraft]);

  return (
    <div
      className="min-w-0 flex-1 text-left"
      onClick={editingTitle ? undefined : onOpen}
    >
      {editingTitle ? (
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
            value={titleDraft}
            disabled={titleEditBusy}
            onChange={(e) => {
              // Auto-grow up to three lines, then keep the native resize handle available.
              autoSizeInlineTitleTextarea(e.currentTarget);
              onTitleDraftChange?.(e.target.value);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              if (titleBlurModeRef.current === "cancel") {
                titleBlurModeRef.current = "commit";
                return;
              }
              onTitleCommit?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onTitleCommit?.();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                titleBlurModeRef.current = "cancel";
                onTitleCancel?.();
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
            )}
          >
            {taskDisplayTitle(task)}
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
          <CliCreatedIndicator task={task} />
        </div>
      ) : null}
      {preview ? (
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
const TASK_CARD_RIGHT_SLOT_REM = 1.75;

function openTaskContentRailStyle(viewMode: TaskCardViewMode): CSSProperties {
  const inlinePaddingRem = viewMode === "small" ? 0.5 : TASK_CARD_INLINE_PADDING_REM;
  const blockPaddingRem = viewMode === "small" ? 0.375 : 0.5;
  return {
    // Keep the movement distance and content width derived from the same slots
    // so view-mode changes do not expose part of the hidden open circle or shift it vertically.
    ["--task-card-inline-padding" as string]: `${inlinePaddingRem}rem`,
    ["--task-card-block-padding" as string]: `${blockPaddingRem}rem`,
    ["--task-card-status-slot" as string]: `${TASK_CARD_STATUS_SLOT_REM}rem`,
    ["--task-card-right-slot" as string]: `${TASK_CARD_RIGHT_SLOT_REM}rem`,
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
  onOpen,
  editingTitle = false,
  titleDraft,
  onTitleDraftChange,
  onTitleCommit,
  onTitleCancel,
  titleEditBusy = false,
  onCompleteFromCircle,
  isDragging,
  skipNavRegistration = false,
}: TaskCardProps) {
  const nav = useBoardKeyboardNavOptional();
  const rootRef = useRef<HTMLDivElement>(null);
  const highlighted = nav?.highlightedTaskId === task.id;
  const viewSpec = getTaskCardViewSpec(viewMode);

  useLayoutEffect(() => {
    if (skipNavRegistration || !nav) return;
    const el = rootRef.current;
    if (el) nav.registerTaskElement(task.id, el);
    return () => {
      nav.registerTaskElement(task.id, null);
    };
  }, [nav, skipNavRegistration, task.id]);

  const preview = viewSpec.showDescriptionPreview
    ? previewBody(task.body, viewSpec.previewMaxLength)
    : "";
  const canCompleteFromCircle =
    task.status === "open" && onCompleteFromCircle !== undefined;
  const isOpenTask = task.status === "open";
  const openTaskRailStyle = openTaskContentRailStyle(viewMode);
  const bodyPaddingClass = taskCardBodyPaddingClass(viewMode);

  return (
    <div
      ref={rootRef}
      data-task-card-root
      data-task-id={task.id}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || skipNavRegistration || !nav) return;
        nav.setHoveredTaskId(task.id);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse" || skipNavRegistration || !nav) return;
        nav.setHoveredTaskId(null);
      }}
      onPointerDown={() => {
        if (editingTitle) return;
        // Clicking into a task should make it current before any editor/dialog opens.
        nav?.selectTask(task.id);
      }}
      className={cn(
        "group/task-card relative w-full overflow-hidden rounded-md border border-border bg-task-card text-sm text-task-card-foreground shadow-sm transition-colors select-none",
        "hover:bg-accent/45",
        task.color && "border-l-4",
        isDragging && "opacity-40",
        highlighted &&
          // Use board-specific selection color so the keyboard ring stands out from the app theme.
          "ring-2 ring-offset-2 ring-offset-background shadow-md [--tw-ring-color:var(--board-selection-ring)]",
      )}
      style={task.color ? { borderLeftColor: task.color } : undefined}
    >
      {isOpenTask ? (
        <div
          className={cn("relative", bodyPaddingClass)}
          style={openTaskRailStyle}
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
                nav?.selectTask(task.id);
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
              preview={preview}
              onOpen={onOpen}
              editingTitle={editingTitle}
              titleDraft={titleDraft}
              onTitleDraftChange={onTitleDraftChange}
              onTitleCommit={onTitleCommit}
              onTitleCancel={onTitleCancel}
              titleEditBusy={titleEditBusy}
            />
          </div>
        </div>
      ) : (
        // Non-open tasks: normal flex layout with status always visible.
        <div className={cn("flex gap-2", bodyPaddingClass)}>
          <div className="shrink-0">
            <TaskStatusIndicator status={task.status} />
          </div>
          <TaskCardContent
            task={task}
            taskPriorities={taskPriorities}
            viewMode={viewMode}
            groupLabel={groupLabel}
            preview={preview}
            onOpen={onOpen}
            editingTitle={editingTitle}
            titleDraft={titleDraft}
            onTitleDraftChange={onTitleDraftChange}
            onTitleCommit={onTitleCommit}
            onTitleCancel={onTitleCancel}
            titleEditBusy={titleEditBusy}
          />
        </div>
      )}
    </div>
  );
});
