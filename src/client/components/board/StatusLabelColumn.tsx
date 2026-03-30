import { Fragment } from "react";
import { StatusBandSplitter } from "./StatusBandSplitter";

interface StatusLabelColumnProps {
  visibleStatuses: string[];
  weights: number[];
  adjustAt: (index: number, deltaY: number) => void;
  flushWeights: () => void;
  splittersDisabled?: boolean;
}

/**
 * Thin left rail: vertical status labels + splitters. No cell borders — tint only.
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
      className="sticky left-0 z-30 flex h-full min-h-0 w-11 shrink-0 flex-col bg-transparent"
      data-board-no-pan
    >
      <div className="shrink-0 min-h-10 bg-transparent" aria-hidden />
      <div className="flex min-h-0 flex-1 flex-col">
        {visibleStatuses.map((status, i) => (
          <Fragment key={status}>
            <div
              style={{
                flexGrow: weights[i] ?? 1,
                flexShrink: 1,
                flexBasis: 0,
                minHeight: 0,
              }}
              className="flex min-h-0 items-center justify-center bg-muted/20 py-1 dark:bg-muted/10"
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
            </div>
            {i < visibleStatuses.length - 1 && (
              <StatusBandSplitter
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
