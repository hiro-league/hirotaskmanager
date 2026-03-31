import { Fragment } from "react";
import { cn } from "@/lib/utils";
import {
  laneStatusAccentClass,
  laneStatusDividerClass,
  laneStatusRailClass,
} from "./laneStatusTheme";
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
      className="sticky left-0 top-0 z-40 flex h-full min-h-0 w-12 shrink-0 flex-col bg-transparent"
      data-board-no-pan
    >
      {/* Only the colored status pills should be visible; the rail shell stays transparent. */}
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
              className={cn(
                "flex min-h-0 items-center justify-center rounded-md py-1",
                laneStatusRailClass(status),
                i > 0 && "mt-1",
              )}
            >
              <span
                className="select-none text-[10px] font-semibold uppercase tracking-widest"
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
                className="mx-1"
                lineClassName={cn(
                  laneStatusDividerClass(status),
                  laneStatusAccentClass(status),
                )}
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
