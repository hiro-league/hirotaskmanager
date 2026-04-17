import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * jsdom lacks `PointerEvent` in some environments; board hooks listen for `pointermove`
 * with `pointerType === "mouse"` (Phase 9 column map tests).
 */
if (typeof globalThis.PointerEvent === "undefined") {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerType: string;
    constructor(type: string, eventInitDict?: PointerEventInit) {
      super(type, eventInitDict);
      this.pointerType = eventInitDict?.pointerType ?? "";
    }
  } as typeof PointerEvent;
}

/**
 * jsdom does not implement ResizeObserver; @dnd-kit and some board components
 * register observers at module load. Phase 5 route/page smoke tests import those modules.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

/** ThemeRoot / board UI use `matchMedia` for system dark preference. */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/** ShortcutHelpDialog scrolls the help table on open; jsdom refs may lack scrollTo. */
if (typeof HTMLElement !== "undefined") {
  const proto = HTMLElement.prototype as HTMLElement & { scrollTo?: unknown };
  if (typeof proto.scrollTo !== "function") {
    proto.scrollTo = function () {};
  }
}

afterEach(() => {
  cleanup();
});
