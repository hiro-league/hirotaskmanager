import { useCallback } from "react";

export interface UseDialogCloseRequestOptions {
  /** When true, close/dismiss shortcuts and backdrop should not run. */
  busy: boolean;
  /** When true and `onDirtyClose` is set, close attempts call `onDirtyClose` instead of `onClose`. */
  isDirty?: boolean;
  onClose: () => void;
  /** e.g. open discard confirmation — Phase 4 wiring; full discard UI comes later. */
  onDirtyClose?: () => void;
}

/**
 * Single entry for Esc, backdrop, and explicit cancel/close controls so they share
 * the same clean vs dirty rules (Phase 4).
 */
export function useDialogCloseRequest({
  busy,
  isDirty = false,
  onClose,
  onDirtyClose,
}: UseDialogCloseRequestOptions): () => void {
  return useCallback(() => {
    if (busy) return;
    if (isDirty && onDirtyClose) {
      onDirtyClose();
      return;
    }
    if (isDirty && !onDirtyClose) {
      // Avoid silent data loss until discard flow exists (Phase 4 work item 6).
      return;
    }
    onClose();
  }, [busy, isDirty, onClose, onDirtyClose]);
}
