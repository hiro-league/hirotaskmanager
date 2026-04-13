import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { boardShortcutRegistry } from "./boardShortcutRegistry";
import {
  SHORTCUT_HELP_TABS,
  type ShortcutHelpTabId,
} from "./boardShortcutTypes";
import { useBackdropDismissClick } from "./useBackdropDismissClick";
import { useDialogCloseRequest } from "./useDialogCloseRequest";
import { useShortcutOverlay } from "./ShortcutScopeContext";
import { useBodyScrollLock } from "./bodyScrollLock";
import {
  MODAL_BACKDROP_SURFACE_CLASS,
  MODAL_DIALOG_OVERSCROLL_CLASS,
  MODAL_TEXT_FIELD_CURSOR_CLASS,
} from "./modalOverlayClasses";
import { useModalFocusTrap } from "./useModalFocusTrap";
import { cn } from "@/lib/utils";

/** Fixed-height scroll region so the dialog does not jump when switching tabs. */
const shortcutTableScrollClassName =
  "h-[min(32rem,min(55vh,calc(90vh_-_14rem)))] overflow-auto";

/** Pixels to scroll per ↑/↓ while this dialog is focused (scope blocks board navigation). */
const HELP_DIALOG_SCROLL_STEP_PX = 48;

function getSortedRowsForHelpTab(tabId: ShortcutHelpTabId) {
  const tagged = boardShortcutRegistry.map((def, registryIndex) => ({
    def,
    registryIndex,
  }));
  const filtered = tagged.filter(({ def }) => def.helpTab === tabId);
  filtered.sort((a, b) => {
    const ao = a.def.helpOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.def.helpOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.registryIndex - b.registryIndex;
  });
  return filtered.map(({ def }) => def);
}

interface ShortcutHelpDialogProps {
  open: boolean;
  /** Called when the dialog closes (button, backdrop, or Escape). */
  onClose: (result?: { dontShowAgain: boolean }) => void;
  /** First-run onboarding: offer to stop auto-opening when selecting a board. */
  showOnboardingExtras?: boolean;
}

/** Table body rows; hover background helps mouse users scan long shortcut lists. */
function ShortcutTableBody({ tabId }: { tabId: ShortcutHelpTabId }) {
  const rows = getSortedRowsForHelpTab(tabId);
  return (
    <tbody>
      {rows.map((def) => (
        <tr
          key={def.id}
          className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/35"
        >
          <td className="align-top py-2.5 pr-4">
            <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
              {def.keys.map((k, keyIndex) => (
                <Fragment key={`${def.id}-${k}-${keyIndex}`}>
                  {keyIndex > 0 ? (
                    <span className="font-normal text-muted-foreground text-[length:calc(0.75rem*0.8)]">
                      or
                    </span>
                  ) : null}
                  {/* Shortcut column key caps: 20% smaller than prior calc(0.75rem*1.5) for denser scan. */}
                  <kbd className="rounded border border-border bg-muted px-2 py-1 font-mono text-[length:calc(0.75rem*1.5*0.8)] leading-none text-foreground">
                    {k}
                  </kbd>
                </Fragment>
              ))}
            </div>
          </td>
          <td className="min-w-0 align-top py-2.5 pr-4 text-left text-sm text-foreground">
            {def.description}
          </td>
          <td className="min-w-[8rem] align-top py-2.5 text-left text-xs text-muted-foreground">
            {def.helpContext ?? ""}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

/**
 * Renders shortcut rows from the board registry so labels stay aligned with behavior.
 * Tabs and {@link BoardShortcutDefinition.helpTab} group shortcuts by area; {@link BoardShortcutDefinition.helpContext} documents when each applies.
 */
export function ShortcutHelpDialog({
  open,
  onClose,
  showOnboardingExtras = false,
}: ShortcutHelpDialogProps) {
  const titleId = useId();
  const tablistId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [activeTab, setActiveTab] = useState<ShortcutHelpTabId>(
    () => SHORTCUT_HELP_TABS[0]!.id,
  );
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dontShowAgainRef = useRef(dontShowAgain);
  dontShowAgainRef.current = dontShowAgain;

  useEffect(() => {
    if (!open) return;
    setDontShowAgain(false);
    setActiveTab(SHORTCUT_HELP_TABS[0]!.id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    tableScrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab, open]);

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
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const tabIndex = SHORTCUT_HELP_TABS.findIndex((t) => t.id === activeTab);
      const safeIdx = tabIndex >= 0 ? tabIndex : 0;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev =
          SHORTCUT_HELP_TABS[
            (safeIdx - 1 + SHORTCUT_HELP_TABS.length) % SHORTCUT_HELP_TABS.length
          ]!;
        setActiveTab(prev.id);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = SHORTCUT_HELP_TABS[(safeIdx + 1) % SHORTCUT_HELP_TABS.length]!;
        setActiveTab(next.id);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        tableScrollRef.current?.scrollBy({
          top: -HELP_DIALOG_SCROLL_STEP_PX,
          behavior: "smooth",
        });
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        tableScrollRef.current?.scrollBy({
          top: HELP_DIALOG_SCROLL_STEP_PX,
          behavior: "smooth",
        });
        return;
      }

      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        requestClose();
      }
    },
    [activeTab, requestClose],
  );

  useShortcutOverlay(open, "shortcut-help-dialog", keyHandler);
  useModalFocusTrap({
    open,
    containerRef: dialogRef,
  });

  const backdropDismiss = useBackdropDismissClick(requestClose);

  useBodyScrollLock(open);

  if (!open) return null;

  const activeMeta = SHORTCUT_HELP_TABS.find((t) => t.id === activeTab);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4",
        MODAL_BACKDROP_SURFACE_CLASS,
      )}
      role="presentation"
      onPointerDown={backdropDismiss.onPointerDown}
      onClick={backdropDismiss.onClick}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          "max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text",
          MODAL_DIALOG_OVERSCROLL_CLASS,
          MODAL_TEXT_FIELD_CURSOR_CLASS,
        )}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          className="text-center text-lg font-semibold uppercase tracking-wide text-foreground"
        >
          Keyboard shortcuts
        </h2>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Use arrows to navigate this dialog,{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
            H
          </kbd>{" "}
          to bring it up again,{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
            Esc
          </kbd>{" "}
          to cancel.
        </p>

        <div
          role="tablist"
          aria-label="Shortcut categories"
          id={tablistId}
          className="mt-8 flex flex-wrap gap-1 border-b border-border pb-2"
        >
          {SHORTCUT_HELP_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${tablistId}-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${tablistId}-panel-${tab.id}`}
                // Keep category tabs out of the Tab key order; ←/→ switch panels, Tab only hits Close / checkbox.
                tabIndex={-1}
                className={
                  selected
                    ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                }
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeMeta ? (
          <p className="mt-2 text-xs text-muted-foreground">{activeMeta.description}</p>
        ) : null}

        <div
          role="tabpanel"
          id={`${tablistId}-panel-${activeTab}`}
          aria-labelledby={`${tablistId}-${activeTab}`}
          className="mt-3"
        >
          <div ref={tableScrollRef} className={shortcutTableScrollClassName}>
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[42%]" />
                <col className="w-[32%]" />
              </colgroup>
              <thead className="sticky top-0 z-[1] border-b border-border bg-card">
                <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th
                    scope="col"
                    className="py-2 pr-4 text-center whitespace-nowrap text-[length:calc(0.75rem*0.8)]"
                  >
                    Shortcut
                  </th>
                  <th scope="col" className="py-2 pr-4 text-center">
                    Action
                  </th>
                  <th scope="col" className="py-2 text-center">
                    When
                  </th>
                </tr>
              </thead>
              <ShortcutTableBody tabId={activeTab} />
            </table>
          </div>
        </div>

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
