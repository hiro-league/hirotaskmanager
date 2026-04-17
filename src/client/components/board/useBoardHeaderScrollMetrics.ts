import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  rootCanConsumeVerticalWheel,
  verticalScrollChainContainsScrollable,
  verticalScrollChainCanConsumeWheel,
  verticalScrollChainCanConsumeWheelWithin,
  wheelComposedPathIncludesModalSurface,
} from "./boardSurfaceWheel";
import { subscribeWindowResize } from "@/lib/useWindowResize";

export interface BoardScrollMetrics {
  hasOverflow: boolean;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

interface HeaderScrollDragState {
  pointerId: number;
  startClientX: number;
  startScrollLeft: number;
  maxScrollLeft: number;
  trackWidth: number;
  thumbWidth: number;
}

const HEADER_SCROLL_TRACK_WIDTH = 176;
const HEADER_SCROLL_MIN_THUMB_WIDTH = 40;
const EMPTY_BOARD_SCROLL_METRICS: BoardScrollMetrics = {
  hasOverflow: false,
  scrollLeft: 0,
  scrollWidth: 0,
  clientWidth: 0,
};

function readBoardScrollMetrics(scroller: HTMLDivElement | null): BoardScrollMetrics {
  if (!scroller) return EMPTY_BOARD_SCROLL_METRICS;
  const clientWidth = scroller.clientWidth;
  const scrollWidth = scroller.scrollWidth;
  return {
    hasOverflow: scrollWidth - clientWidth > 1,
    scrollLeft: scroller.scrollLeft,
    scrollWidth,
    clientWidth,
  };
}

function syncHeaderScrollCssVars(
  header: HTMLDivElement | null,
  metrics: BoardScrollMetrics,
): void {
  if (!header) return;
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const leftShadowOpacity = metrics.hasOverflow
    ? Math.min(0.14, metrics.scrollLeft / 160)
    : 0;
  const rightFadeOpacity =
    metrics.hasOverflow && maxScrollLeft > 0
      ? Math.min(0.1, (maxScrollLeft - metrics.scrollLeft) / 160)
      : 0;
  header.style.setProperty(
    "--board-header-left-shadow-opacity",
    String(leftShadowOpacity),
  );
  header.style.setProperty(
    "--board-header-right-fade-opacity",
    String(rightFadeOpacity),
  );
}

interface UseBoardHeaderScrollMetricsOptions {
  boardId: number | null;
  stackedLayout: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  headerRef: RefObject<HTMLDivElement | null>;
}

export interface UseBoardHeaderScrollMetricsResult {
  headerHovered: boolean;
  headerScrollDragging: boolean;
  boardScrollMetrics: BoardScrollMetrics;
  headerScrollTrackRef: RefObject<HTMLDivElement | null>;
  headerScrollVisible: boolean;
  headerScrollMaxLeft: number;
  headerScrollThumbWidth: number;
  headerScrollThumbOffset: number;
  onHeaderMouseEnter: () => void;
  onHeaderMouseLeave: () => void;
  onHeaderScrollTrackPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onHeaderScrollTrackPointerMove: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onHeaderScrollTrackPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onHeaderScrollTrackPointerCancel: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onHeaderScrollTrackLostPointerCapture: () => void;
}

export function useBoardHeaderScrollMetrics({
  boardId,
  stackedLayout,
  scrollRef,
  headerRef,
}: UseBoardHeaderScrollMetricsOptions): UseBoardHeaderScrollMetricsResult {
  const [headerHovered, setHeaderHovered] = useState(false);
  const [headerScrollDragging, setHeaderScrollDragging] = useState(false);
  const [boardScrollMetrics, setBoardScrollMetrics] = useState<BoardScrollMetrics>(
    EMPTY_BOARD_SCROLL_METRICS,
  );
  const headerScrollTrackRef = useRef<HTMLDivElement>(null);
  const headerScrollDragRef = useRef<HeaderScrollDragState | null>(null);

  const syncBoardScrollMetrics = useCallback(() => {
    const next = readBoardScrollMetrics(scrollRef.current);
    syncHeaderScrollCssVars(headerRef.current, next);
    setBoardScrollMetrics((prev) =>
      prev.hasOverflow === next.hasOverflow &&
      prev.scrollLeft === next.scrollLeft &&
      prev.scrollWidth === next.scrollWidth &&
      prev.clientWidth === next.clientWidth
        ? prev
        : next,
    );
  }, [headerRef, scrollRef]);

  // Sync is driven by scroll/resize/RO below; avoid a no-deps effect that ran every commit (§2.1).
  useEffect(() => {
    syncBoardScrollMetrics();
    const scroller = scrollRef.current;
    if (!scroller) return;
    const content = scroller.firstElementChild;
    const onScroll = () => syncBoardScrollMetrics();
    scroller.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => syncBoardScrollMetrics());
    resizeObserver?.observe(scroller);
    if (content instanceof Element) resizeObserver?.observe(content);

    const unsubResize = subscribeWindowResize(syncBoardScrollMetrics);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resizeObserver?.disconnect();
      unsubResize();
    };
  }, [boardId, scrollRef, syncBoardScrollMetrics, stackedLayout]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const header = headerRef.current;
    if (!scroller) return;

    const applyHorizontal = (event: WheelEvent) => {
      const maxLeft = scroller.scrollWidth - scroller.clientWidth;
      if (maxLeft <= 1) return;
      event.preventDefault();
      scroller.scrollLeft += event.deltaY + event.deltaX;
      syncBoardScrollMetrics();
    };

    const onWheelBoard = (event: WheelEvent) => {
      if (wheelComposedPathIncludesModalSurface(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (verticalScrollChainContainsScrollable(target, scroller)) return;
      if (verticalScrollChainCanConsumeWheel(target, event.deltaY, scroller)) return;
      if (stackedLayout && rootCanConsumeVerticalWheel(scroller, event.deltaY)) return;
      applyHorizontal(event);
    };

    const onWheelHeader = (event: WheelEvent) => {
      if (wheelComposedPathIncludesModalSurface(event)) return;
      const target = event.target;
      if (!(target instanceof Element) || !header) return;
      if (verticalScrollChainCanConsumeWheelWithin(target, event.deltaY, header)) return;
      if (stackedLayout && rootCanConsumeVerticalWheel(scroller, event.deltaY)) {
        event.preventDefault();
        scroller.scrollTop += event.deltaY;
        syncBoardScrollMetrics();
        return;
      }
      applyHorizontal(event);
    };

    scroller.addEventListener("wheel", onWheelBoard, { passive: false });
    header?.addEventListener("wheel", onWheelHeader, { passive: false });
    return () => {
      scroller.removeEventListener("wheel", onWheelBoard);
      header?.removeEventListener("wheel", onWheelHeader);
    };
  }, [headerRef, scrollRef, stackedLayout, syncBoardScrollMetrics]);

  const onHeaderScrollTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const scroller = scrollRef.current;
      const track = headerScrollTrackRef.current;
      if (!scroller || !track) return;

      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      if (maxScrollLeft <= 0) return;

      const trackWidth = track.clientWidth;
      const thumbWidth = Math.max(
        HEADER_SCROLL_MIN_THUMB_WIDTH,
        (trackWidth * scroller.clientWidth) / scroller.scrollWidth,
      );
      const travel = Math.max(1, trackWidth - thumbWidth);
      const clickedThumb = (event.target as Element).closest("[data-board-scroll-thumb]");

      if (!clickedThumb) {
        const rect = track.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const nextThumbOffset = Math.min(
          Math.max(pointerX - thumbWidth / 2, 0),
          travel,
        );
        scroller.scrollLeft = (nextThumbOffset / travel) * maxScrollLeft;
        syncBoardScrollMetrics();
      }

      headerScrollDragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startScrollLeft: scroller.scrollLeft,
        maxScrollLeft,
        trackWidth,
        thumbWidth,
      };
      setHeaderScrollDragging(true);
      try {
        track.setPointerCapture(event.pointerId);
      } catch {
        /* already captured or unsupported */
      }
      event.preventDefault();
    },
    [scrollRef, syncBoardScrollMetrics],
  );

  const onHeaderScrollTrackPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = headerScrollDragRef.current;
      const scroller = scrollRef.current;
      if (!drag || !scroller || event.pointerId !== drag.pointerId) return;

      const travel = Math.max(1, drag.trackWidth - drag.thumbWidth);
      const startThumbOffset = (drag.startScrollLeft / drag.maxScrollLeft) * travel;
      const nextThumbOffset = Math.min(
        Math.max(startThumbOffset + (event.clientX - drag.startClientX), 0),
        travel,
      );
      scroller.scrollLeft = (nextThumbOffset / travel) * drag.maxScrollLeft;
      syncBoardScrollMetrics();
      event.preventDefault();
    },
    [scrollRef, syncBoardScrollMetrics],
  );

  const onHeaderScrollTrackPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = headerScrollDragRef.current;
      const track = headerScrollTrackRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      try {
        track?.releasePointerCapture(event.pointerId);
      } catch {
        /* not captured */
      }
      headerScrollDragRef.current = null;
      setHeaderScrollDragging(false);
      syncBoardScrollMetrics();
    },
    [syncBoardScrollMetrics],
  );

  const onHeaderScrollTrackLostPointerCapture = useCallback(() => {
    headerScrollDragRef.current = null;
    setHeaderScrollDragging(false);
    syncBoardScrollMetrics();
  }, [syncBoardScrollMetrics]);

  const headerScrollVisible =
    boardScrollMetrics.hasOverflow && (headerHovered || headerScrollDragging);
  const headerScrollMaxLeft = Math.max(
    0,
    boardScrollMetrics.scrollWidth - boardScrollMetrics.clientWidth,
  );
  const headerScrollThumbWidth = boardScrollMetrics.hasOverflow
    ? Math.max(
        HEADER_SCROLL_MIN_THUMB_WIDTH,
        (HEADER_SCROLL_TRACK_WIDTH * boardScrollMetrics.clientWidth) /
          boardScrollMetrics.scrollWidth,
      )
    : HEADER_SCROLL_TRACK_WIDTH;
  const headerScrollThumbTravel = Math.max(
    0,
    HEADER_SCROLL_TRACK_WIDTH - headerScrollThumbWidth,
  );
  const headerScrollThumbOffset =
    headerScrollMaxLeft > 0
      ? (boardScrollMetrics.scrollLeft / headerScrollMaxLeft) *
        headerScrollThumbTravel
      : 0;

  return {
    headerHovered,
    headerScrollDragging,
    boardScrollMetrics,
    headerScrollTrackRef,
    headerScrollVisible,
    headerScrollMaxLeft,
    headerScrollThumbWidth,
    headerScrollThumbOffset,
    onHeaderMouseEnter: () => setHeaderHovered(true),
    onHeaderMouseLeave: () => setHeaderHovered(false),
    onHeaderScrollTrackPointerDown,
    onHeaderScrollTrackPointerMove,
    onHeaderScrollTrackPointerUp,
    onHeaderScrollTrackPointerCancel: onHeaderScrollTrackPointerUp,
    onHeaderScrollTrackLostPointerCapture,
  };
}
