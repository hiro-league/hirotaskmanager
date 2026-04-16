import NumberFlow, {
  continuous,
  useCanAnimate,
} from "@number-flow/react";
import { useLayoutEffect, useRef, useState } from "react";
import type { TaskCountStat } from "../../../../shared/boardStats";
import { cn } from "@/lib/utils";

/** Low-saturation chip fills so T/O/C read as soft status tints, not full banners. */
const chipBoardT =
  "border-border/60 bg-muted/55 text-foreground dark:border-border/50 dark:bg-muted/45";
/** O = non-closed tasks — orange tint with readable opacity (avoid washed-out / red-looking tints). */
const chipBoardO =
  "border-orange-500/45 bg-orange-500/68 text-orange-950 dark:border-orange-400/50 dark:text-orange-50";
const chipBoardC =
  "border-emerald-600/35 bg-emerald-600/68 text-emerald-950 dark:border-emerald-500/40 dark:text-emerald-100";

const chipBoardL =
  "border-border/60 bg-muted/55 text-foreground dark:border-border/50 dark:bg-muted/45";

const chipListT =
  "border-border/50 bg-muted/35 text-foreground dark:bg-muted/30";
const chipListO =
  "border-orange-500/38 bg-orange-500/60 text-orange-950 dark:border-orange-400/42 dark:text-orange-50";
const chipListC =
  "border-emerald-600/18 bg-emerald-600/50 text-emerald-950 dark:border-emerald-500/18 dark:text-emerald-100";

const STATS_FLOW_TIMING = {
  spinTiming: {
    duration: 450,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  } as const,
  transformTiming: {
    duration: 400,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  } as const,
  opacityTiming: {
    duration: 220,
    easing: "ease-out",
  } as const,
};

function StatChip({
  label,
  value,
  className,
  showSpinner,
  entryToken,
  valueTitle,
}: {
  label: "T" | "O" | "C" | "L";
  value: number;
  className?: string;
  showSpinner: boolean;
  entryToken: number;
  /** Exposed to assistive tech — full word, not shown as chip text. */
  valueTitle: string;
}) {
  const canAnimate = useCanAnimate();
  const [flowValue, setFlowValue] = useState(() => (showSpinner ? 0 : value));
  const prevShowSpinner = useRef(showSpinner);
  const prevEntryToken = useRef(entryToken);

  // After the loading spinner hides, run 0 → value once so NumberFlow performs an entry count.
  // useLayoutEffect avoids one painted frame at the old count before resetting to 0.
  // When the stats are merely revealed from hidden state, `entryToken` provides the same one-shot
  // 0 → value path even if TanStack Query already has cached numbers and skips the spinner.
  // When the spinner is off and `value` changes (filters, refetch without spinner), sync directly.
  useLayoutEffect(() => {
    if (showSpinner) {
      prevShowSpinner.current = true;
      return;
    }
    if (prevShowSpinner.current) {
      prevShowSpinner.current = false;
      setFlowValue(0);
      let raf1 = 0;
      let raf2 = 0;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setFlowValue(value));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    if (entryToken !== prevEntryToken.current) {
      prevEntryToken.current = entryToken;
      setFlowValue(0);
      let raf1 = 0;
      let raf2 = 0;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setFlowValue(value));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setFlowValue(value);
  }, [entryToken, showSpinner, value]);

  return (
    <span
      className={cn(
        "inline-flex min-w-[2.25rem] items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums shadow-sm",
        className,
      )}
      title={valueTitle}
    >
      <span aria-hidden className="opacity-90">
        {label}
      </span>
      {showSpinner ? (
        // css-loaders.com/dots — styles: `index.css` → `.board-stats-dots-loader`
        <div
          className="board-stats-dots-loader shrink-0"
          aria-hidden
        />
      ) : (
        // @number-flow/react: flowValue drives both entry (0→n after spinner) and later updates.
        <span
          className="inline-flex min-w-[1.25rem] justify-end [font-variant-numeric:tabular-nums]"
          aria-label={`${valueTitle}: ${value}`}
        >
          <NumberFlow
            value={flowValue}
            plugins={[continuous]}
            animated={canAnimate}
            className="leading-none"
            {...STATS_FLOW_TIMING}
            willChange
          />
        </span>
      )}
    </span>
  );
}

export function BoardStatsChipsRow({
  stats,
  listCount,
  showSpinner,
  entryToken,
}: {
  stats: TaskCountStat;
  /** Structural count of lists on the board (not affected by task filters). */
  listCount: number;
  showSpinner: boolean;
  entryToken: number;
}) {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-1.5"
      aria-label="Task counts for current filters"
    >
      <StatChip
        label="L"
        value={listCount}
        showSpinner={false}
        entryToken={entryToken}
        valueTitle="Lists on this board"
        className={chipBoardL}
      />
      <StatChip
        label="T"
        value={stats.total}
        showSpinner={showSpinner}
        entryToken={entryToken}
        valueTitle="Total tasks"
        className={chipBoardT}
      />
      <StatChip
        label="O"
        value={stats.open}
        showSpinner={showSpinner}
        entryToken={entryToken}
        valueTitle="Open / in-progress tasks"
        className={chipBoardO}
      />
      <StatChip
        label="C"
        value={stats.closed}
        showSpinner={showSpinner}
        entryToken={entryToken}
        valueTitle="Closed tasks"
        className={chipBoardC}
      />
    </div>
  );
}

export function ListStatsChipsRow({
  stats,
  showSpinner,
  entryToken,
}: {
  stats: TaskCountStat;
  showSpinner: boolean;
  entryToken: number;
}) {
  return (
    <div
      className="flex items-center justify-center gap-1 border-b border-border/60 bg-muted/40 px-2 py-1"
      aria-label="List task counts"
    >
      <StatChip
        label="T"
        value={stats.total}
        showSpinner={showSpinner}
        entryToken={entryToken}
        valueTitle="Total tasks in this list"
        className={chipListT}
      />
      <StatChip
        label="O"
        value={stats.open}
        showSpinner={showSpinner}
        entryToken={entryToken}
        valueTitle="Open / in-progress tasks in this list"
        className={chipListO}
      />
      <StatChip
        label="C"
        value={stats.closed}
        showSpinner={showSpinner}
        entryToken={entryToken}
        valueTitle="Closed tasks in this list"
        className={chipListC}
      />
    </div>
  );
}
