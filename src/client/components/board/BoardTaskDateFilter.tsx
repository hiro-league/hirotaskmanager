import { useRef } from "react";
import { ArrowRight, Calendar } from "lucide-react";
import type { Board } from "../../../shared/models";
import {
  usePreferencesStore,
  type TaskDateFilterPersisted,
} from "@/store/preferences";
import {
  BOARD_HEADER_FILTER_SECTION_LABEL_CLASS,
  BOARD_HEADER_SECTION_EDIT_ICON_SLOT_CLASS,
  boardHeaderToggleButtonClass,
} from "./boardHeaderButtonStyles";
import { todayDateKeyLocal, type TaskDateFilterMode } from "./boardStatusUtils";
import { cn } from "@/lib/utils";

// Invisible `input type="date"` sits over a day/month label; the browser picker still edits the full calendar date.

interface BoardTaskDateFilterProps {
  board: Board;
}

const MODE_CYCLE: TaskDateFilterMode[] = ["opened", "closed", "any"];

const MODE_LABEL: Record<TaskDateFilterMode, string> = {
  opened: "Open Date",
  closed: "Close Date",
  any: "Any Date",
};

function nextMode(current: TaskDateFilterMode): TaskDateFilterMode {
  const i = MODE_CYCLE.indexOf(current);
  const next = MODE_CYCLE[(i + 1) % MODE_CYCLE.length];
  return next ?? "any";
}

/** Local calendar day + month for compact display (year omitted in the strip). */
function formatDayMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatCompactDateLabel(ymd: string): string {
  return ymd === todayDateKeyLocal() ? "Today" : formatDayMonth(ymd);
}

function DateField({
  value,
  onChange,
  ariaLabel,
  titleFull,
  min,
  max,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  /** Full YYYY-MM-DD for tooltip (year visible on hover, not in the strip). */
  titleFull: string;
  /** Native `min` / `max` for `type="date"` (YYYY-MM-DD). */
  min?: string;
  max?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    // A real button is easier to hit than an invisible full-surface date input.
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        // Keep the native picker anchored to the visible pill instead of the page corner.
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label={ariaLabel}
        className={cn(
          boardHeaderToggleButtonClass(false),
          "inline-flex h-7 min-w-[2.65rem] shrink-0 items-center justify-center px-1 py-0",
        )}
        title={titleFull}
      >
        <span className="pointer-events-none select-none text-[11px] tabular-nums text-foreground/90">
          {formatCompactDateLabel(value)}
        </span>
      </button>
    </div>
  );
}

export function BoardTaskDateFilter({ board }: BoardTaskDateFilterProps) {
  const raw = usePreferencesStore(
    (s) => s.taskDateFilterByBoardId[String(board.id)],
  );
  const setFilter = usePreferencesStore((s) => s.setTaskDateFilterForBoard);

  const enabled = Boolean(raw?.enabled);
  const mode: TaskDateFilterMode =
    raw?.mode === "opened" || raw?.mode === "closed" || raw?.mode === "any"
      ? raw.mode
      : "any";
  const startDate = raw?.startDate ?? todayDateKeyLocal();
  const endDate = raw?.endDate ?? todayDateKeyLocal();

  const persist = (next: TaskDateFilterPersisted) => {
    setFilter(board.id, next);
  };

  const toggleFilter = () => {
    const today = todayDateKeyLocal();
    if (!enabled) {
      persist({
        enabled: true,
        mode:
          raw?.mode === "opened" || raw?.mode === "closed" || raw?.mode === "any"
            ? raw.mode
            : "any",
        startDate:
          raw?.startDate && raw.startDate.length === 10 ? raw.startDate : today,
        endDate: raw?.endDate && raw.endDate.length === 10 ? raw.endDate : today,
      });
    } else {
      persist({
        enabled: false,
        mode,
        startDate,
        endDate,
      });
    }
  };

  const setBothToday = () => {
    const today = todayDateKeyLocal();
    persist({
      enabled: true,
      mode,
      startDate: today,
      endDate: today,
    });
  };

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-2"
      role="group"
      aria-label="Task date filter"
    >
      {/* Match Groups/Priority label inset: reserve the same leading slot as the pencil row (empty here). */}
      <span className="inline-flex shrink-0 items-center gap-1">
        <span className={BOARD_HEADER_SECTION_EDIT_ICON_SLOT_CLASS} aria-hidden />
        <span className={BOARD_HEADER_FILTER_SECTION_LABEL_CLASS}>Dates</span>
      </span>
      {/* One flex item for all date controls so they wrap as a block vs the label, not control-by-control. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-2">
        <button
          type="button"
          className={boardHeaderToggleButtonClass(enabled)}
          aria-pressed={enabled}
          title={
            enabled
              ? "Date filter on — click for none"
              : "Date filter off — click to filter"
          }
          onClick={toggleFilter}
        >
          {enabled ? "Filter" : "None"}
        </button>
        {enabled ? (
          <>
            <button
              type="button"
              className={cn(
                boardHeaderToggleButtonClass(false),
                "h-7 min-w-[5.75rem] justify-center px-1.5 py-0 text-center text-[11px] font-medium",
              )}
              title={`Compare by ${MODE_LABEL[mode].toLowerCase()} date — click to cycle`}
              aria-label={`Date field: ${MODE_LABEL[mode]}. Click to cycle Opened, Closed, Any.`}
              onClick={() =>
                persist({
                  enabled: true,
                  mode: nextMode(mode),
                  startDate,
                  endDate,
                })
              }
            >
              {MODE_LABEL[mode]}
            </button>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-foreground shadow-sm",
                  "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                title="Set start and end to today"
                aria-label="Set start and end to today"
                onClick={setBothToday}
              >
                <Calendar className="size-3.5 shrink-0" aria-hidden />
              </button>
              <DateField
                value={startDate}
                ariaLabel="Range start date"
                titleFull={`Start: ${startDate}`}
                max={endDate}
                onChange={(next) =>
                  persist({
                    enabled: true,
                    mode,
                    startDate: next,
                    // If start moves past end, collapse the range to that day (picker max already limits this).
                    endDate: next > endDate ? next : endDate,
                  })
                }
              />
              <ArrowRight
                className="size-3 shrink-0 text-muted-foreground"
                aria-hidden
                strokeWidth={2.25}
              />
              <DateField
                value={endDate}
                ariaLabel="Range end date"
                titleFull={`End: ${endDate}`}
                min={startDate}
                onChange={(next) =>
                  persist({
                    enabled: true,
                    mode,
                    startDate: next < startDate ? next : startDate,
                    endDate: next,
                  })
                }
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
