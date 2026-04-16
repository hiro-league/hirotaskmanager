import type { ComponentPropsWithoutRef, ReactNode, RefObject } from "react";
import { BoardScrollRootContext } from "./lanes/useColumnInViewport";
import { cn } from "@/lib/utils";

type BoardCanvasPanHandlers = Pick<
  ComponentPropsWithoutRef<"div">,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
>;

interface BoardCanvasProps {
  boardSurfaceId: string | null;
  stackedLayout: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  panning: boolean;
  boardCanvasPanHandlers: BoardCanvasPanHandlers;
  children: ReactNode;
}

export function BoardCanvas({
  boardSurfaceId,
  stackedLayout,
  scrollRef,
  panning,
  boardCanvasPanHandlers,
  children,
}: BoardCanvasProps) {
  return (
    <div
      id={boardSurfaceId ?? undefined}
      ref={scrollRef}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto px-4 pb-4 pt-4 select-none",
        stackedLayout ? "overflow-y-auto" : "overflow-y-hidden",
        "cursor-grab",
        panning && "cursor-grabbing select-none",
      )}
      {...boardCanvasPanHandlers}
    >
      {/* Keep the observer root on the actual board scroller after extracting the canvas shell. */}
      <BoardScrollRootContext.Provider value={scrollRef}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-0">{children}</div>
      </BoardScrollRootContext.Provider>
    </div>
  );
}
