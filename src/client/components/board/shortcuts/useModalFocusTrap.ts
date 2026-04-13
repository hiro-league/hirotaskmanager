import { useEffect, useRef, type RefObject } from "react";

const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(", ");

function isVisibleElement(element: HTMLElement): boolean {
  return element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true";
}

function getTabbableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (element) => {
      if (element.hasAttribute("disabled") || element.hasAttribute("inert")) return false;
      if (!isVisibleElement(element)) return false;
      // `button:not([disabled])` still matches `<button tabIndex={-1}>`; exclude non-tabbable buttons/controls.
      if (element.tabIndex < 0) return false;
      return true;
    },
  );
}

/** Tab order: explicit positive `tabIndex` first (ascending), then `tabIndex` 0 in tree order. */
function sortTabbableElements(elements: HTMLElement[]): HTMLElement[] {
  const positive = elements
    .filter((e) => e.tabIndex > 0)
    .sort((a, b) => a.tabIndex - b.tabIndex);
  const zero = elements.filter((e) => e.tabIndex === 0);
  return [...positive, ...zero];
}

function focusElement(element: HTMLElement | null | undefined): boolean {
  if (!element || !element.isConnected) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

interface UseModalFocusTrapOptions {
  /** Whether the dialog is mounted/open at all. */
  open: boolean;
  /** Whether this dialog is the topmost active modal (false while a child modal is open). */
  active?: boolean;
  /** Dialog root element; used for focus containment and fallback focus. */
  containerRef: RefObject<HTMLElement | null>;
  /** Optional preferred target when the dialog first becomes active. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * When this value changes while the dialog stays open, initial focus runs again (e.g. async
   * editor mounts its textarea after the first frame).
   */
  initialFocusRetryKey?: string | number;
  /** Restore the opener when the dialog fully closes. */
  restoreFocus?: boolean;
}

/**
 * Keeps browser tab focus inside the active modal dialog and restores focus to the opener on close.
 * This complements scoped shortcut handling: shortcut scope decides who receives keys, while this hook
 * controls where `Tab` / `Shift+Tab` are allowed to move DOM focus.
 */
export function useModalFocusTrap({
  open,
  active = open,
  containerRef,
  initialFocusRef,
  initialFocusRetryKey,
  restoreFocus = true,
}: UseModalFocusTrapOptions): void {
  const openerRef = useRef<HTMLElement | null>(null);
  const capturedOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (!capturedOpenRef.current) {
        const activeElement = document.activeElement;
        openerRef.current =
          activeElement instanceof HTMLElement && activeElement !== document.body
            ? activeElement
            : null;
        capturedOpenRef.current = true;
      }
      return;
    }
    capturedOpenRef.current = false;
  }, [open]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !open || !active) return;

    const focusInitial = () => {
      // Prefer explicit initial focus first. A later pass (e.g. when `initialFocusRetryKey`
      // changes) must still run if e.g. the emoji was focused before the textarea mounted.
      if (focusElement(initialFocusRef?.current)) return;
      if (container.contains(document.activeElement)) return;
      const tabbables = sortTabbableElements(getTabbableElements(container));
      if (focusElement(tabbables[0])) return;
      if (!container.hasAttribute("tabindex")) container.tabIndex = -1;
      focusElement(container);
    };

    const frameId = window.requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const liveContainer = containerRef.current;
      if (!liveContainer) return;
      const tabbables = sortTabbableElements(getTabbableElements(liveContainer));
      if (tabbables.length === 0) {
        event.preventDefault();
        if (!liveContainer.hasAttribute("tabindex")) liveContainer.tabIndex = -1;
        focusElement(liveContainer);
        return;
      }

      const first = tabbables[0]!;
      const last = tabbables[tabbables.length - 1]!;
      const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const insideContainer = current ? liveContainer.contains(current) : false;

      if (event.shiftKey) {
        if (!insideContainer || current === first) {
          event.preventDefault();
          focusElement(last);
        }
        return;
      }

      if (!insideContainer || current === last) {
        event.preventDefault();
        focusElement(first);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, active, containerRef, initialFocusRef, initialFocusRetryKey]);

  useEffect(() => {
    if (open || !restoreFocus) return;
    const opener = openerRef.current;
    if (!opener || !opener.isConnected) return;
    const frameId = window.requestAnimationFrame(() => {
      focusElement(opener);
      openerRef.current = null;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [open, restoreFocus]);
}
