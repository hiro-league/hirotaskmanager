import type { Task } from "../../../shared/models";
import { cn } from "@/lib/utils";

function previewBody(body: string, max = 100): string {
  const plain = body.replace(/\s+/g, " ").trim();
  if (!plain) return "";
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

interface TaskCardProps {
  task: Task;
  onOpen: () => void;
}

export function TaskCard({ task, onOpen }: TaskCardProps) {
  const preview = previewBody(task.body);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-md border border-border bg-card px-2.5 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent/40",
        task.color && "border-l-4",
      )}
      style={
        task.color
          ? { borderLeftColor: task.color }
          : undefined
      }
    >
      <div className="font-medium text-foreground">{task.title || "Untitled"}</div>
      {preview ? (
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {preview}
        </div>
      ) : null}
      <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
        {task.group}
      </div>
    </button>
  );
}
