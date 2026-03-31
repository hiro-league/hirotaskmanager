import { useCallback, useId } from "react";
import { useDialogCloseRequest } from "./useDialogCloseRequest";
import { useShortcutOverlay } from "./ShortcutScopeContext";

interface DiscardChangesDialogProps {
  open: boolean;
  /** User confirms discarding edits — caller should close the parent editor without saving. */
  onDiscard: () => void;
  /** User keeps editing (Esc / Cancel). */
  onCancel: () => void;
}

/**
 * Shown when a dirty editor is closed — sits above the parent dialog in the shortcut stack (`discard-dialog`).
 */
export function DiscardChangesDialog({
  open,
  onDiscard,
  onCancel,
}: DiscardChangesDialogProps) {
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
        onDiscard();
      }
    },
    [onDiscard, requestCancel],
  );

  useShortcutOverlay(open, "discard-dialog", keyHandler);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4"
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
          Discard changes?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You have unsaved changes. Discard them and close?
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={requestCancel}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90"
            onClick={onDiscard}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
