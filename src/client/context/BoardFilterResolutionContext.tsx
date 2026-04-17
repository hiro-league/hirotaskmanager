import { createContext, use, type ReactNode } from "react";
import type { TaskDateFilterResolved } from "@/components/board/boardStatusUtils";
import type { TaskCardViewMode } from "@/store/preferences";

/**
 * Resolved board filter + card view prefs for the current board (see react-best-practices-review §2.4).
 * One subscription at BoardView instead of per-band / per-column `useResolved*` fan-out.
 */
export interface BoardFilterResolutionContextValue {
  activeGroupIds: string[] | null;
  activePriorityIds: string[] | null;
  activeReleaseIds: string[] | null;
  dateFilterResolved: TaskDateFilterResolved | null;
  taskCardViewMode: TaskCardViewMode;
}

const BoardFilterResolutionContext =
  createContext<BoardFilterResolutionContextValue | null>(null);

export function BoardFilterResolutionProvider({
  value,
  children,
}: {
  value: BoardFilterResolutionContextValue;
  children: ReactNode;
}) {
  return (
    <BoardFilterResolutionContext.Provider value={value}>
      {children}
    </BoardFilterResolutionContext.Provider>
  );
}

export function useBoardFilterResolution(): BoardFilterResolutionContextValue {
  const ctx = use(BoardFilterResolutionContext);
  if (!ctx) {
    throw new Error(
      "useBoardFilterResolution must be used within BoardFilterResolutionProvider",
    );
  }
  return ctx;
}
