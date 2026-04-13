import { useEffect } from "react";

let lockDepth = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";

function applyLock() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  savedHtmlOverflow = html.style.overflow;
  savedBodyOverflow = body.style.overflow;
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
}

function releaseLock() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = savedHtmlOverflow;
  body.style.overflow = savedBodyOverflow;
}

/**
 * Prevents the board / page behind a modal from scrolling when the user uses the wheel
 * (stack-safe when multiple overlays are open).
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    lockDepth += 1;
    if (lockDepth === 1) {
      applyLock();
    }
    return () => {
      lockDepth -= 1;
      if (lockDepth === 0) {
        releaseLock();
      }
    };
  }, [locked]);
}
