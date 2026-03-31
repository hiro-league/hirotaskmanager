import { useCallback, useEffect, useId, useRef, useState } from "react";
import { boardShortcutRegistry } from "./boardShortcutRegistry";
import { useDialogCloseRequest } from "./useDialogCloseRequest";
import { useShortcutOverlay } from "./ShortcutScopeContext";

interface ShortcutHelpDialogProps {
  open: boolean;
  /** Called when the dialog closes (button, backdrop, or Escape). */
  onClose: (result?: { dontShowAgain: boolean }) => void;
  /** First-run onboarding: offer to stop auto-opening when selecting a board. */
  showOnboardingExtras?: boolean;
}

/**
 * Renders shortcut rows from the board registry so labels stay aligned with behavior.
 */
export function ShortcutHelpDialog({
  open,
  onClose,
  showOnboardingExtras = false,
}: ShortcutHelpDialogProps) {
  const titleId = useId();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dontShowAgainRef = useRef(dontShowAgain);
  dontShowAgainRef.current = dontShowAgain;

  useEffect(() => {
    if (!open) return;
    setDontShowAgain(false);
  }, [open]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const finishClose = useCallback(() => {
    onCloseRef.current?.({
      dontShowAgain: Boolean(showOnboardingExtras && dontShowAgainRef.current),
    });
  }, [showOnboardingExtras]);

  const requestClose = useDialogCloseRequest({
    busy: false,
    onClose: finishClose,
  });

  const keyHandler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        requestClose();
      }
    },
    [requestClose],
  );

  useShortcutOverlay(open, "shortcut-help-dialog", keyHandler);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          Keyboard shortcuts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These shortcuts apply while viewing a board (not while typing in a field).
          Press{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
            H
          </kbd>{" "}
          anytime to open this dialog.
        </p>

        <ul className="mt-4 space-y-2 text-sm">
          {boardShortcutRegistry.map((def) => (
            <li
              key={def.id}
              className="flex gap-3 border-b border-border/60 py-2 last:border-0"
            >
              <span className="flex shrink-0 gap-1">
                {def.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="min-w-0 text-foreground">{def.description}</span>
            </li>
          ))}
        </ul>

        {showOnboardingExtras ? (
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border border-input"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>Don&apos;t show this again when I open a board</span>
          </label>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={requestClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
