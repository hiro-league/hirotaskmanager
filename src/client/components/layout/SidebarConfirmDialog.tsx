import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useBackdropDismissClick } from "@/components/board/shortcuts/useBackdropDismissClick";
import { useModalFocusTrap } from "@/components/board/shortcuts/useModalFocusTrap";

export interface SidebarConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SidebarConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  busy = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: SidebarConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (!confirmDisabled && !busy) onConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, confirmDisabled, onCancel, onConfirm, open]);

  useModalFocusTrap({
    open,
    containerRef: dialogRef,
    initialFocusRef: cancelButtonRef,
  });

  const backdropDismiss = useBackdropDismissClick(onCancel, { disabled: busy });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onPointerDown={backdropDismiss.onPointerDown}
      onClick={backdropDismiss.onClick}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sidebar-delete-board-title"
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="sidebar-delete-board-title"
          className="text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {children ? <div className="mt-3">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            ref={cancelButtonRef}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
