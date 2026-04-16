import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Track whether a list column shell is inside (or near) the horizontal viewport
 * of the board scroll container.
 *
 * Off-screen columns keep their outer shell mounted for correct layout width and
 * column-reorder DnD, but skip rendering the expensive task body (sortable rows,
 * virtualizers, keyboard-nav registrations) until they scroll into view.
 *
 * Board perf plan #4 addendum — horizontal column gating.
 * Board perf plan #9B + initial gate: default `inViewport` is false and we promote
 * synchronously in `useLayoutEffect` when already near the scroll root so the
 * first paint does not mount all `ListStackedBody` trees (avoids eager mount).
 */

// ── Tuning knobs ──────────────────────────────────────────────────────
// Tune COLUMN_GATE_MARGIN_PX to control how far ahead (in pixels) columns
// pre-mount their body before scrolling into the visible area.
// One column ≈ 288px (w-72) + 16px gap = ~304px.  Keep this at 1–2×
// column-width; larger = smoother scrolls but more mounted task cards.
const COLUMN_GATE_MARGIN_PX = 500;

// Delay before committing an off-screen transition (ms).  Prevents the
// rare stuck-header bug where a fast flick causes the IO callback to
// fire "not intersecting" just before the column re-enters the viewport.
const HIDE_DEBOUNCE_MS = 150;

// After committing a hide, schedule a safety check this many ms later
// using getBoundingClientRect.  If the IO missed a re-entry callback
// (can happen during rapid scroll + layout shifts), this recovers.
const SAFETY_CHECK_MS = 400;
// ──────────────────────────────────────────────────────────────────────

function columnNearHorizontalViewport(
  el: HTMLElement,
  root: HTMLElement | null,
  marginPx: number,
): boolean {
  const elRect = el.getBoundingClientRect();
  if (root) {
    const rootRect = root.getBoundingClientRect();
    return (
      elRect.right >= rootRect.left - marginPx &&
      elRect.left <= rootRect.right + marginPx
    );
  }
  return (
    elRect.right >= -marginPx &&
    elRect.left <= window.innerWidth + marginPx
  );
}

// ── Context: board scroll root for IO ─────────────────────────────────
// The IO root must be the element that clips columns horizontally
// (the BoardView scroll container with overflow-x-auto), NOT the
// viewport, otherwise intersection data is wrong when the board
// doesn't fill the full browser width.
export const BoardScrollRootContext = createContext<
  React.RefObject<HTMLElement | null> | null
>(null);

export function useColumnInViewport(
  enabled = true,
): { columnRef: React.RefObject<HTMLDivElement | null>; inViewport: boolean } {
  const scrollRootRef = useContext(BoardScrollRootContext);
  const columnRef = useRef<HTMLDivElement | null>(null);
  // Start false so the first commit does not mount ListStackedBody everywhere;
  // useLayoutEffect + IntersectionObserver promote when near the scrollport.
  const [inViewport, setInViewport] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronous visibility before paint so on-screen columns skip a header-only flash.
  useLayoutEffect(() => {
    if (!enabled) {
      setInViewport(true);
      return;
    }
    const el = columnRef.current;
    if (!el) return;
    const root = scrollRootRef?.current ?? null;
    if (columnNearHorizontalViewport(el, root, COLUMN_GATE_MARGIN_PX)) {
      setInViewport(true);
    }
  }, [enabled, scrollRootRef]);

  useEffect(() => {
    if (!enabled) {
      setInViewport(true);
      return;
    }

    const el = columnRef.current;
    if (!el) return;

    const root = scrollRootRef?.current ?? null;

    const isElementVisible = () =>
      columnNearHorizontalViewport(el, root, COLUMN_GATE_MARGIN_PX);

    const clearTimers = () => {
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (safetyTimerRef.current != null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        if (entry.isIntersecting) {
          clearTimers();
          setInViewport(true);
        } else {
          if (hideTimerRef.current == null) {
            hideTimerRef.current = setTimeout(() => {
              hideTimerRef.current = null;
              // IO said not intersecting — commit the hide, then schedule
              // a getBoundingClientRect safety check in case the IO missed
              // a subsequent re-entry due to rapid layout shifts.
              setInViewport(false);
              safetyTimerRef.current = setTimeout(() => {
                safetyTimerRef.current = null;
                if (isElementVisible()) setInViewport(true);
              }, SAFETY_CHECK_MS);
            }, HIDE_DEBOUNCE_MS);
          }
        }
      },
      {
        root,
        rootMargin: `0px ${COLUMN_GATE_MARGIN_PX}px 0px ${COLUMN_GATE_MARGIN_PX}px`,
        threshold: 0,
      },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimers();
    };
  }, [enabled, scrollRootRef]);

  return { columnRef, inViewport };
}
