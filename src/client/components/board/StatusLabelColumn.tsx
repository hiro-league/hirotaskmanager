import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { statusDotClass } from "./laneStatusTheme";
import { StatusBandSplitter } from "./StatusBandSplitter";

interface StatusLabelColumnProps {
  visibleStatuses: string[];
  weights: number[];
  adjustAt: (index: number, deltaY: number) => void;
  flushWeights: () => void;
  splittersDisabled?: boolean;
}

/**
 * Thin left rail: vertical status labels + splitters. Only status bands are tinted; the rail shell is transparent.
 */
export function StatusLabelColumn({
  visibleStatuses,
  weights,
  adjustAt,
  flushWeights,
  splittersDisabled,
}: StatusLabelColumnProps) {
  return (
    <div
      // z-50: later flex siblings paint on top when lists scroll horizontally; shell stays transparent.
      className="sticky left-0 top-0 z-50 flex h-full min-h-0 w-[3.25rem] shrink-0 flex-col bg-transparent"
      data-board-no-pan
    >
      <div className="shrink-0 min-h-10 bg-transparent" aria-hidden />
      <div className="flex min-h-0 flex-1 flex-col px-0.5">
        {visibleStatuses.map((status, i) => (
          <Fragment key={status}>
            <div
              style={{
                flexGrow: weights[i] ?? 1,
                flexShrink: 1,
                flexBasis: 0,
                minHeight: 0,
              }}
              className={cn(
                // Only these bands are tinted; gaps and the header offset stay transparent like before.
                "flex min-h-0 flex-col items-center justify-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-1 py-1.5 dark:bg-muted/65",
                i > 0 && "mt-1",
              )}
            >
              <span
                className="select-none text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                style={{
                  writingMode: "vertical-lr",
                  transform: "rotate(180deg)",
                }}
              >
                {status.replace(/-/g, " ")}
              </span>
              {/* Column layout so the dot sits south of the vertical label (not west). */}
              <span
                className={cn(
                  "size-5 shrink-0 rounded-full border-2 border-black dark:border-white/20",
                  statusDotClass(status),
                )}
                aria-hidden
              />
            </div>
            {i < visibleStatuses.length - 1 && (
              <StatusBandSplitter
                className="mx-1"
                lineClassName="border-border/80"
                disabled={splittersDisabled}
                onDrag={(dy) => adjustAt(i, dy)}
                onCommit={flushWeights}
              />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
