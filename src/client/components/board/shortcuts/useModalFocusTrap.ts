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
      if (container.contains(document.activeElement)) return;
      if (focusElement(initialFocusRef?.current)) return;
      const tabbables = getTabbableElements(container);
      if (focusElement(tabbables[0])) return;
      if (!container.hasAttribute("tabindex")) container.tabIndex = -1;
      focusElement(container);
    };

    const frameId = window.requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const liveContainer = containerRef.current;
      if (!liveContainer) return;
      const tabbables = getTabbableElements(liveContainer);
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
  }, [open, active, containerRef, initialFocusRef]);

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
