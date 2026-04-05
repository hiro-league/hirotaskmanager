/**
 * Wheel routing for the board canvas: vertical wheel over list bodies keeps native
 * vertical scroll; elsewhere (gaps, headers, rail) we translate wheel deltas to
 * horizontal scroll on the board scroller.
 */

const OVERFLOW_Y_SCROLLABLE = new Set(["auto", "scroll", "overlay"]);

function isVerticalOverflowScrollable(el: HTMLElement): boolean {
  return OVERFLOW_Y_SCROLLABLE.has(window.getComputedStyle(el).overflowY);
}

/**
 * Walks from `target` up to but excluding `root`. Returns true if some ancestor
 * is a vertical scroll container that can still absorb `deltaY`.
 */
export function verticalScrollChainCanConsumeWheel(
  target: Element,
  deltaY: number,
  root: HTMLElement,
): boolean {
  if (deltaY === 0) return false;
  let el: Element | null = target;
  while (el && el !== root) {
    if (el instanceof HTMLElement && isVerticalOverflowScrollable(el)) {
      const { scrollHeight, clientHeight, scrollTop } = el;
      if (scrollHeight > clientHeight + 1) {
        const maxScroll = scrollHeight - clientHeight;
        const eps = 2;
        if (deltaY > 0 && scrollTop < maxScroll - eps) return true;
        if (deltaY < 0 && scrollTop > eps) return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Returns true when the wheel target sits inside a real vertical scroll area,
 * even if that scroller is already pinned at its top/bottom edge. This lets
 * the board avoid "handing off" list-edge wheel gestures to horizontal panning.
 */
export function verticalScrollChainContainsScrollable(
  target: Element,
  root: HTMLElement,
): boolean {
  let el: Element | null = target;
  while (el && el !== root) {
    if (el instanceof HTMLElement && isVerticalOverflowScrollable(el)) {
      if (el.scrollHeight > el.clientHeight + 1) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Like {@link verticalScrollChainCanConsumeWheel}, but walks ancestors only while
 * inside `container` (inclusive). Use for wheel targets outside the board scroller
 * (e.g. board header) so we do not walk up into app chrome.
 */
export function verticalScrollChainCanConsumeWheelWithin(
  target: Element,
  deltaY: number,
  container: HTMLElement,
): boolean {
  if (deltaY === 0) return false;
  let el: Element | null = target;
  while (el && container.contains(el)) {
    if (el instanceof HTMLElement && isVerticalOverflowScrollable(el)) {
      const { scrollHeight, clientHeight, scrollTop } = el;
      if (scrollHeight > clientHeight + 1) {
        const maxScroll = scrollHeight - clientHeight;
        const eps = 2;
        if (deltaY > 0 && scrollTop < maxScroll - eps) return true;
        if (deltaY < 0 && scrollTop > eps) return true;
      }
    }
    if (el === container) break;
    el = el.parentElement;
  }
  return false;
}

/** True when `root` itself can scroll vertically in the direction of `deltaY`. */
export function rootCanConsumeVerticalWheel(root: HTMLElement, deltaY: number): boolean {
  if (deltaY === 0) return false;
  const { scrollHeight, clientHeight, scrollTop } = root;
  if (scrollHeight <= clientHeight + 1) return false;
  const maxScroll = scrollHeight - clientHeight;
  const eps = 2;
  if (deltaY > 0 && scrollTop < maxScroll - eps) return true;
  if (deltaY < 0 && scrollTop > eps) return true;
  return false;
}
