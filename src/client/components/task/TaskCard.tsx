import { Check } from "lucide-react";
import type { Task, TaskStatus } from "../../../shared/models";
import { cn } from "@/lib/utils";

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
  /** Display label for `task.groupId` (resolved from board definitions). */
  groupLabel: string;
  onOpen: () => void;
}

export function TaskCard({ task, groupLabel, onOpen }: TaskCardProps) {
  const preview = previewBody(task.body);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-md border border-border bg-task-card px-2.5 py-2 text-left text-sm text-task-card-foreground shadow-sm transition-colors",
        "hover:bg-accent/40 dark:hover:bg-white/[0.06]",
        task.color && "border-l-4",
      )}
      style={task.color ? { borderLeftColor: task.color } : undefined}
      aria-label={`${statusAriaLabel(task.status)}: ${task.title || "Untitled"}`}
    >
      <div className="flex gap-2">
        <TaskStatusIndicator status={task.status} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{task.title || "Untitled"}</div>
          {preview ? (
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {preview}
            </div>
          ) : null}
          <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            {groupLabel}
          </div>
        </div>
      </div>
    </button>
  );
}
