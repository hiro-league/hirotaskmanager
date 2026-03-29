import { useCallback, useRef } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusBandSplitterProps {
  onDrag: (deltaY: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}

export function StatusBandSplitter({
  onDrag,
  onCommit,
  disabled,
}: StatusBandSplitterProps) {
  const lastY = useRef<number | null>(null);
  const dragging = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      dragging.current = true;
      lastY.current = e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || lastY.current == null) return;
      const dy = e.clientY - lastY.current;
      lastY.current = e.clientY;
      if (dy !== 0) onDrag(dy);
    },
    [onDrag],
  );

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      dragging.current = false;
      lastY.current = null;
      onCommit();
    },
    [onCommit],
  );

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize status sections"
      className={cn(
        "group relative flex h-3 shrink-0 cursor-row-resize items-center justify-center bg-transparent",
        disabled && "pointer-events-none opacity-40",
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border/50 group-hover:bg-border group-hover:h-0.5" />
      <ChevronsUpDown
        className="relative z-10 size-4 text-muted-foreground group-hover:text-foreground"
        aria-hidden
      />
    </div>
  );
}
