import { Plus, X } from "lucide-react";
import type { Ref, RefObject, ReactNode } from "react";
import { clampTaskTitleInput } from "../../../../shared/taskTitle";
import { TaskTitleCharsLeft } from "@/components/task/TaskTitleCharsLeft";
import { cn } from "@/lib/utils";

/**
 * Inline “add task” composer (lanes + stacked). State lives in useBandController /
 * useStackedListTaskActions — compound pieces are presentational only so typing
 * does not re-render the virtualized list via a wide context (composition review #6).
 */

export interface ComposerFormProps {
  title: string;
  setTitle: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  addCardRef: RefObject<HTMLDivElement | null>;
  isPending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onBlur: () => void;
}

function ComposerRoot({
  ref: rootRef,
  children,
  className,
}: {
  ref?: Ref<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      ref={rootRef}
      className={cn(
        "mt-2 shrink-0 rounded-md border border-border bg-background p-2 shadow-sm",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function ComposerTextarea({
  ref: areaRef,
  value,
  onChange,
  disabled,
  onBlur,
  onSubmit,
  onCancel,
}: {
  ref?: Ref<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onBlur: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <textarea
      ref={areaRef}
      rows={3}
      autoComplete="off"
      spellCheck={false}
      className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground select-text"
      placeholder="Enter a title or paste a link"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(clampTaskTitleInput(e.target.value))}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

function ComposerCharCount({ title }: { title: string }) {
  return (
    <div className="flex justify-end">
      <TaskTitleCharsLeft value={title} />
    </div>
  );
}

function ComposerActionRow({
  title,
  isPending,
  onSubmit,
  onCancel,
}: {
  title: string;
  isPending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
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
  );
}

function ComposerFab({ onOpen }: { onOpen: () => void }) {
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

function ComposerForm({
  title,
  setTitle,
  inputRef,
  addCardRef,
  isPending,
  onSubmit,
  onCancel,
  onBlur,
}: ComposerFormProps) {
  return (
    <ComposerRoot ref={addCardRef}>
      <div className="flex flex-col gap-1">
        <ComposerTextarea
          ref={inputRef}
          value={title}
          onChange={setTitle}
          disabled={isPending}
          onBlur={onBlur}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
        <ComposerCharCount title={title} />
      </div>
      <ComposerActionRow
        title={title}
        isPending={isPending}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </ComposerRoot>
  );
}

export const Composer = Object.assign(ComposerForm, {
  Root: ComposerRoot,
  Textarea: ComposerTextarea,
  CharCount: ComposerCharCount,
  ActionRow: ComposerActionRow,
  Fab: ComposerFab,
});
