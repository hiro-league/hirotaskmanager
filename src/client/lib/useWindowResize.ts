import { useEffect, useRef } from "react";

/**
 * Single `window` resize listener shared across subscribers (Priority 3 — client-event-listeners).
 * Avoids N stacked columns × multi-select instances each attaching their own listener.
 */
const subscribers = new Set<() => void>();
let windowListenerAttached = false;

function dispatchWindowResize(): void {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("useWindowResize subscriber failed:", e);
    }
  });
}

function attachWindowResizeListener(): void {
  if (typeof window === "undefined" || windowListenerAttached) return;
  window.addEventListener("resize", dispatchWindowResize);
  windowListenerAttached = true;
}

function detachWindowResizeListenerIfIdle(): void {
  if (typeof window === "undefined" || !windowListenerAttached || subscribers.size > 0) {
    return;
  }
  window.removeEventListener("resize", dispatchWindowResize);
  windowListenerAttached = false;
}

/** Subscribe to shared window resize; returns unsubscribe. */
export function subscribeWindowResize(listener: () => void): () => void {
  subscribers.add(listener);
  attachWindowResizeListener();
  return () => {
    subscribers.delete(listener);
    detachWindowResizeListenerIfIdle();
  };
}

/**
 * Runs `callback` once on mount and on every window resize via the shared listener.
 */
export function useWindowResize(callback: () => void): void {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const run = () => ref.current();
    run();
    return subscribeWindowResize(run);
  }, []);
}
