import { useCallback, useId, useRef } from "react";
import { useBackdropDismissClick } from "./useBackdropDismissClick";
import { useDialogCloseRequest } from "./useDialogCloseRequest";
import { useShortcutOverlay } from "./ShortcutScopeContext";
import { useBodyScrollLock } from "./bodyScrollLock";
import {
  MODAL_BACKDROP_SURFACE_CLASS,
  MODAL_TEXT_FIELD_CURSOR_CLASS,
} from "./modalOverlayClasses";
import { useModalFocusTrap } from "./useModalFocusTrap";
import { cn } from "@/lib/utils";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
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
  useModalFocusTrap({
    open,
    containerRef,
    initialFocusRef: cancelButtonRef,
  });

  const backdropDismiss = useBackdropDismissClick(requestCancel);

  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4",
        MODAL_BACKDROP_SURFACE_CLASS,
      )}
      role="presentation"
      onPointerDown={backdropDismiss.onPointerDown}
      onClick={backdropDismiss.onClick}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={containerRef}
        tabIndex={-1}
        className={cn(
          "w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg",
          MODAL_TEXT_FIELD_CURSOR_CLASS,
        )}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
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
            ref={cancelButtonRef}
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
