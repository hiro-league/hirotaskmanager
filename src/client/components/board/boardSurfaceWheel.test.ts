import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  rootCanConsumeVerticalWheel,
  verticalScrollChainCanConsumeWheel,
  verticalScrollChainCanConsumeWheelWithin,
  verticalScrollChainContainsScrollable,
  wheelComposedPathIncludesModalSurface,
} from "./boardSurfaceWheel";

function styleWithOverflowY(overflowY: string): CSSStyleDeclaration {
  return { overflowY } as CSSStyleDeclaration;
}

describe("boardSurfaceWheel", () => {
  /** Intentionally loose so `vi.spyOn(window, "getComputedStyle")` fits strict generics. */
  let getComputedStyleSpy: { mockRestore: () => void };

  beforeEach(() => {
    getComputedStyleSpy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((el: Element) => {
        const y = (el as HTMLElement).dataset.overflowY ?? "visible";
        return styleWithOverflowY(y);
      });
  });

  afterEach(() => {
    getComputedStyleSpy.mockRestore();
  });

  function setScrollMetrics(
    el: HTMLElement,
    opts: { scrollHeight: number; clientHeight: number; scrollTop: number },
  ) {
    Object.defineProperty(el, "scrollHeight", {
      value: opts.scrollHeight,
      configurable: true,
    });
    Object.defineProperty(el, "clientHeight", {
      value: opts.clientHeight,
      configurable: true,
    });
    Object.defineProperty(el, "scrollTop", {
      value: opts.scrollTop,
      writable: true,
      configurable: true,
    });
  }

  test("verticalScrollChainCanConsumeWheel returns false when deltaY is 0", () => {
    const root = document.createElement("div");
    const child = document.createElement("div");
    child.dataset.overflowY = "auto";
    setScrollMetrics(child, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 });
    root.appendChild(child);
    expect(verticalScrollChainCanConsumeWheel(child, 0, root)).toBe(false);
  });

  test("verticalScrollChainCanConsumeWheel is true when a descendant can scroll further in wheel direction", () => {
    const root = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.dataset.overflowY = "auto";
    setScrollMetrics(scroller, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 });
    const inner = document.createElement("div");
    scroller.appendChild(inner);
    root.appendChild(scroller);
    expect(verticalScrollChainCanConsumeWheel(inner, 5, root)).toBe(true);
  });

  test("verticalScrollChainCanConsumeWheel is false when scroller is pinned at bottom for downward wheel", () => {
    const root = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.dataset.overflowY = "scroll";
    setScrollMetrics(scroller, { scrollHeight: 200, clientHeight: 100, scrollTop: 100 });
    const inner = document.createElement("div");
    scroller.appendChild(inner);
    root.appendChild(scroller);
    expect(verticalScrollChainCanConsumeWheel(inner, 10, root)).toBe(false);
  });

  test("verticalScrollChainContainsScrollable is true when a scrollable ancestor exists regardless of edge position", () => {
    const root = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.dataset.overflowY = "auto";
    setScrollMetrics(scroller, { scrollHeight: 200, clientHeight: 100, scrollTop: 100 });
    const inner = document.createElement("div");
    scroller.appendChild(inner);
    root.appendChild(scroller);
    expect(verticalScrollChainContainsScrollable(inner, root)).toBe(true);
  });

  test("verticalScrollChainCanConsumeWheelWithin does not walk above container", () => {
    const outside = document.createElement("div");
    outside.dataset.overflowY = "auto";
    setScrollMetrics(outside, { scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
    const container = document.createElement("div");
    const target = document.createElement("span");
    outside.appendChild(container);
    container.appendChild(target);
    expect(verticalScrollChainCanConsumeWheelWithin(target, 5, container)).toBe(false);
  });

  test("verticalScrollChainCanConsumeWheelWithin considers scrollers inside container", () => {
    const container = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.dataset.overflowY = "overlay";
    setScrollMetrics(scroller, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 });
    const target = document.createElement("span");
    container.appendChild(scroller);
    scroller.appendChild(target);
    expect(verticalScrollChainCanConsumeWheelWithin(target, 3, container)).toBe(true);
  });

  test("wheelComposedPathIncludesModalSurface detects dialog role in composed path", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const path = [dialog, document.body];
    const ev = { composedPath: () => path } as unknown as WheelEvent;
    expect(wheelComposedPathIncludesModalSurface(ev)).toBe(true);
  });

  test("wheelComposedPathIncludesModalSurface detects alertdialog role", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    const ev = { composedPath: () => [dialog] } as unknown as WheelEvent;
    expect(wheelComposedPathIncludesModalSurface(ev)).toBe(true);
  });

  test("rootCanConsumeVerticalWheel respects root scroll metrics", () => {
    const root = document.createElement("div");
    setScrollMetrics(root, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 });
    expect(rootCanConsumeVerticalWheel(root, 4)).toBe(true);
    setScrollMetrics(root, { scrollHeight: 100, clientHeight: 100, scrollTop: 0 });
    expect(rootCanConsumeVerticalWheel(root, 4)).toBe(false);
  });
});
