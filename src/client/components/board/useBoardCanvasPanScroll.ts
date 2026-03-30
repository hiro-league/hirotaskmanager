import { useCallback, useRef, useState } from "react";

const ACTIVATION_PX = 6;

/** Selectors for elements that must not start horizontal board pan (columns, chrome, controls). */
const NO_PAN =
  "[data-board-no-pan],button,a[href],input,textarea,select,option,label,[role='button'],[contenteditable='true']";

function targetStartsPan(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(NO_PAN) == null;
}

type PanMode = "undecided" | "horizontal" | "none";

export function useBoardCanvasPanScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    mode: PanMode;
  } | null>(null);

  const [panning, setPanning] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (!targetStartsPan(e.target)) return;
    const scroller = scrollRef.current;
    if (!scroller) return;

    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: scroller.scrollLeft,
      mode: "undecided",
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const scroller = scrollRef.current;
    if (!pan || !scroller || e.pointerId !== pan.pointerId) return;

    if (pan.mode === "none") return;

    if (pan.mode === "undecided") {
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      if (
        Math.abs(dx) < ACTIVATION_PX &&
        Math.abs(dy) < ACTIVATION_PX
      ) {
        return;
      }
      if (Math.abs(dx) >= Math.abs(dy)) {
        pan.mode = "horizontal";
        try {
          scroller.setPointerCapture(e.pointerId);
        } catch {
          /* already captured or unsupported */
        }
        e.preventDefault();
        setPanning(true);
      } else {
        pan.mode = "none";
        panRef.current = null;
        return;
      }
    }

    if (pan.mode === "horizontal") {
      const dx = e.clientX - pan.startX;
      scroller.scrollLeft = pan.startScrollLeft - dx;
      e.preventDefault();
    }
  }, []);

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const scroller = scrollRef.current;
    if (!pan || e.pointerId !== pan.pointerId) return;

    if (pan.mode === "horizontal" && scroller) {
      try {
        scroller.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      setPanning(false);
    }
    panRef.current = null;
  }, []);

  return {
    scrollRef,
    panning,
    boardCanvasPanHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
    },
  };
}
