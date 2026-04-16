import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/**
 * True when the scroll container has more content than fits (vertical).
 * Once raw overflow is detected, stays true until `latchResetKey` changes
 * (e.g. tasks added/removed), so layout/scroll quirks at the bottom edge
 * cannot briefly report "no overflow" while content is still effectively
 * pinned to the bottom edge.
 */
export function useVerticalScrollOverflow(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  remeasureKey: string,
  latchResetKey: string,
): boolean {
  const [overflows, setOverflows] = useState(false);
  const latchedRef = useRef(false);
  const prevLatchKeyRef = useRef<string | null>(null);

  const measure = useCallback(() => {
    if (!enabled) {
      latchedRef.current = false;
      prevLatchKeyRef.current = null;
      setOverflows(false);
      return;
    }
    const sc = scrollRef.current;
    if (!sc) return;

    if (prevLatchKeyRef.current !== latchResetKey) {
      prevLatchKeyRef.current = latchResetKey;
      latchedRef.current = false;
    }

    const raw = sc.scrollHeight > sc.clientHeight + 2;
    if (raw) latchedRef.current = true;

    setOverflows(raw || latchedRef.current);
  }, [enabled, scrollRef, latchResetKey]);

  useLayoutEffect(() => {
    measure();
  }, [measure, remeasureKey]);

  useEffect(() => {
    if (!enabled) return;
    const sc = scrollRef.current;
    const inner = contentRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    if (inner) ro.observe(inner);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, measure, scrollRef, contentRef]);

  return enabled && overflows;
}

export function scrollElementToBottomThen(
  scrollEl: HTMLElement | null,
  onDone: () => void,
): void {
  if (!scrollEl) {
    onDone();
    return;
  }
  scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
  let finished = false;
  const run = () => {
    if (finished) return;
    finished = true;
    onDone();
  };
  scrollEl.addEventListener("scrollend", run, { once: true });
  window.setTimeout(run, 400);
}
