import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import { Check } from "lucide-react";
import {
  priorityDisplayLabel,
  priorityLabelForId,
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
  /** When set, only for `open` tasks: click the empty circle to complete (does not open the editor). */
  onCompleteFromCircle?: () => void;
  /** When true, dim the card to indicate it's being dragged. */
  isDragging?: boolean;
  /**
   * When false (default), this card registers its root for keyboard scroll targeting.
   * SortableTaskRow sets true so only the row wrapper registers once per task.
   */
  skipNavRegistration?: boolean;
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
  return (
    <span
      className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-black/85"
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
}: {
  task: Task;
  taskPriorities: TaskPriorityDefinition[];
  viewMode: TaskCardViewMode;
  groupLabel: string;
  preview: string;
  onOpen: () => void;
}) {
  const viewSpec = getTaskCardViewSpec(viewMode);
  const priorityLabel = priorityLabelForId(taskPriorities, task.priorityId);
  const priorityColor =
    task.priorityId != null
      ? taskPriorities.find((priority) => priority.id === task.priorityId)?.color
      : undefined;
  return (
    <div className="min-w-0 flex-1 text-left" onClick={onOpen}>
      <div className={cn("font-medium", viewSpec.titleClassName)}>
        {task.title || "Untitled"}
      </div>
      {viewMode !== "small" ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="uppercase tracking-wide text-muted-foreground/80">
            {groupLabel}
          </span>
          {priorityLabel && priorityColor ? (
            <PriorityPill label={priorityLabel} color={priorityColor} />
          ) : null}
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
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || skipNavRegistration || !nav) return;
        nav.setHoveredTaskId(task.id);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse" || skipNavRegistration || !nav) return;
        nav.setHoveredTaskId(null);
      }}
      className={cn(
        "group/task-card relative w-full overflow-hidden rounded-md border border-border bg-task-card text-sm text-task-card-foreground shadow-sm transition-colors select-none",
        "hover:bg-accent/45",
        task.color && "border-l-4",
        isDragging && "opacity-40",
        highlighted &&
          "ring-2 ring-ring ring-offset-2 ring-offset-background shadow-md",
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
              className={cn(
                "absolute left-[var(--task-card-inline-padding)] top-[var(--task-card-block-padding)] inline-flex w-[var(--task-card-status-slot)] items-start justify-start rounded-sm opacity-0 outline-none transition-opacity duration-150 ring-offset-background pointer-events-none group-hover/task-card:pointer-events-auto group-hover/task-card:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label="Mark complete"
              title="Mark complete"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCompleteFromCircle();
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
          />
        </div>
      )}
    </div>
  );
});
