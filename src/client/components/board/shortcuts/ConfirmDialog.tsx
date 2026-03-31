import { useCallback, useId } from "react";
import { useDialogCloseRequest } from "./useDialogCloseRequest";
import type { ShortcutScope } from "./shortcutScopeTypes";
import { useShortcutOverlay } from "./ShortcutScopeContext";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Scoped keyboard handling (Esc = cancel, Enter = confirm). */
  scope: ShortcutScope;
  onConfirm: () => void;
  onCancel: () => void;
  /** Destructive confirm button styling (e.g. delete). */
  variant?: "default" | "destructive";
}

/**
 * App-owned confirmation modal — replaces `window.confirm` for board flows (Phase 4).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  scope,
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmDialogProps) {
  const titleId = useId();
  const requestCancel = useDialogCloseRequest({
    busy: false,
    onClose: onCancel,
  });

  const keyHandler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    },
    [onConfirm, requestCancel],
  );

  useShortcutOverlay(open, scope, keyHandler);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={requestCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          className="text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={requestCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-primary-foreground",
              variant === "destructive"
                ? "bg-destructive hover:opacity-90"
                : "bg-primary hover:opacity-90",
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
