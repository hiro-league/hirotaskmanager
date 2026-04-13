import { taskTitleGraphemesRemaining } from "../../../shared/taskTitle";
import { cn } from "@/lib/utils";

const DEFAULT_WARN_REMAINING = 10;

/** Live count of grapheme “characters” remaining for the task title field (matches `taskTitle.ts`). */
export function TaskTitleCharsLeft({
  value,
  className,
  /** When remaining is at or below this, use destructive (red) styling. */
  warnAtRemaining = DEFAULT_WARN_REMAINING,
}: {
  value: string;
  className?: string;
  warnAtRemaining?: number;
}) {
  const n = taskTitleGraphemesRemaining(value);
  const warn = n <= warnAtRemaining;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        warn ? "text-destructive" : "text-muted-foreground",
        className,
      )}
      aria-live="polite"
    >
      {n} Chrs Left
    </span>
  );
}
