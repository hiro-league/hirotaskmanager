import { createContext, useContext, type ReactNode } from "react";
import type { TaskCountStat } from "../../../shared/boardStats";

export interface BoardStatsDisplayValue {
  /** Board-level T/O/C when stats are enabled and loaded (or placeholder). */
  board: TaskCountStat | null;
  listStat(listId: number): TaskCountStat;
  /** Increments when stats visibility turns on so chips can run one-shot entry motion. */
  entryToken: number;
  /** True while fetching (including background refresh after filter change). */
  fetching: boolean;
  /** True on first load with no cached placeholder. */
  pending: boolean;
  /** Show spinner inside chips (initial load or stale placeholder during refetch). */
  showChipSpinner: boolean;
  /** True when the stats request failed; avoid showing misleading zero chips. */
  statsError: boolean;
}

const BoardStatsDisplayContext = createContext<BoardStatsDisplayValue | null>(
  null,
);

export function BoardStatsDisplayProvider({
  value,
  children,
}: {
  value: BoardStatsDisplayValue;
  children: ReactNode;
}) {
  return (
    <BoardStatsDisplayContext.Provider value={value}>
      {children}
    </BoardStatsDisplayContext.Provider>
  );
}

/** List columns read per-list stats; returns null when stats are hidden or unavailable. */
export function useBoardStatsDisplayOptional(): BoardStatsDisplayValue | null {
  return useContext(BoardStatsDisplayContext);
}
