import { Plus, X } from "lucide-react";
import type { RefObject } from "react";
import { clampTaskTitleInput } from "../../../../shared/taskTitle";
import { TaskTitleCharsLeft } from "@/components/task/TaskTitleCharsLeft";
import { cn } from "@/lib/utils";

interface BandComposerProps {
  title: string;
  setTitle: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  addCardRef: RefObject<HTMLDivElement | null>;
  isPending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onBlur: () => void;
}

export function BandComposer({
  title,
  setTitle,
  inputRef,
  addCardRef,
  isPending,
  onSubmit,
  onCancel,
  onBlur,
}: BandComposerProps) {
  return (
    <div
      ref={addCardRef}
      className="mt-2 shrink-0 rounded-md border border-border bg-background p-2 shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col gap-1">
        <textarea
          ref={inputRef}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground select-text"
          placeholder="Enter a title or paste a link"
          value={title}
          disabled={isPending}
          onChange={(e) => setTitle(clampTaskTitleInput(e.target.value))}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex justify-end">
          <TaskTitleCharsLeft value={title} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={isPending || !title.trim()}
          onClick={onSubmit}
        >
          Add task
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Cancel"
          disabled={isPending}
          onClick={onCancel}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

interface BandFabProps {
  onOpen: () => void;
}

export function BandFab({ onOpen }: BandFabProps) {
  return (
    <button
      type="button"
      aria-label="Add task"
      className={cn(
        "absolute bottom-3 right-3 z-10",
        "flex size-11 shrink-0 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-md ring-1 ring-border/60",
        "opacity-0 pointer-events-none transition-opacity duration-150",
        "group-hover/list-col:opacity-100 group-hover/list-col:pointer-events-auto",
        "hover:opacity-90",
        "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <Plus className="size-6" strokeWidth={2.5} aria-hidden />
    </button>
  );
}
