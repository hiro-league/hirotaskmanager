import type { MouseEvent } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import {
  useRestoreBoard,
  useRestoreList,
  useRestoreTask,
} from "@/api/mutations";
import { reportMutationError } from "@/lib/mutationErrorUi";
import type { NotificationRestoreTarget } from "@/lib/notificationPresentation";
import { cn } from "@/lib/utils";
import { useNotificationUiStore } from "@/store/notificationUi";

const TARGET_LABEL: Record<NotificationRestoreTarget["entityType"], string> = {
  board: "Board",
  list: "List",
  task: "Task",
};

interface NotificationRestoreButtonProps {
  target: NotificationRestoreTarget;
  /** Optional callback invoked after the restore mutation succeeds (e.g. to dismiss a toast). */
  onRestored?: () => void;
  /** Optional CSS overrides for layout-specific surfaces (toast vs panel). */
  className?: string;
}

/**
 * Inline action rendered on `*.trashed` notifications so users can soft-restore the entity
 * directly from the bell panel or the in-app toast. Uses the same restore mutations as the
 * Trash page; on success a confirmation system toast is shown.
 */
export function NotificationRestoreButton({
  target,
  onRestored,
  className,
}: NotificationRestoreButtonProps) {
  const restoreTask = useRestoreTask();
  const restoreList = useRestoreList();
  const restoreBoard = useRestoreBoard();
  const mutation =
    target.entityType === "task"
      ? restoreTask
      : target.entityType === "list"
        ? restoreList
        : restoreBoard;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Stop the surrounding row/toast click handler from firing (which would navigate away).
    event.stopPropagation();
    if (mutation.isPending || mutation.isSuccess) return;
    mutation.mutate(target.id, {
      onSuccess: () => {
        useNotificationUiStore.getState().pushSystemToast({
          message: `${TARGET_LABEL[target.entityType]} “${target.displayName}” restored.`,
        });
        onRestored?.();
      },
      onError: (err) => reportMutationError(`restore ${target.entityType}`, err),
    });
  };

  const baseClass =
    "inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";

  if (mutation.isSuccess) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300",
          className,
        )}
      >
        <RotateCcw className="size-3.5 shrink-0" aria-hidden />
        Restored
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={mutation.isPending}
      aria-label={`Restore ${TARGET_LABEL[target.entityType].toLowerCase()} ${target.displayName}`}
      className={cn(baseClass, className)}
    >
      {mutation.isPending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
      ) : (
        <RotateCcw className="size-3.5 shrink-0" aria-hidden />
      )}
      {mutation.isPending ? "Restoring…" : "Restore"}
    </button>
  );
}
