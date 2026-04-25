import { Loader2 } from "lucide-react";

/**
 * Shown while a new list row exists only in the client cache (negative `listId`) during create-list
 * mutation; removed on success or on rollback.
 */
export function ListColumnCreatingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="absolute inset-0 z-20 flex cursor-wait items-center justify-center rounded-[inherit] bg-background/50"
      aria-live="polite"
      role="status"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        <span>Creating…</span>
      </div>
    </div>
  );
}
