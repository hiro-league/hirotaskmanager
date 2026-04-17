import { createContext, use, useMemo, type ReactNode } from "react";

/**
 * Board layout variance (composition review #11)
 *
 * `resolvedBoardLayout(board)` is either `"lanes"` (horizontal columns with status bands) or
 * `"stacked"` (one column per list, statuses stacked vertically). The fork propagates to:
 *
 * - **Columns shell:** `BoardColumns` vs `BoardColumnsStacked` — both receive the same `board`;
 *   use `BoardColumnsResolved` to pick by context instead of a boolean at the parent.
 * - **Per-list behavior:** lane boards use `useBandController` + `BandTaskList` / `ListStatusBand`;
 *   stacked boards use `useStackedListTaskActions` + `StackedTaskList` / `BoardListStackedColumn`.
 *
 * Keep new layout-specific logic near these pairs so the split stays explicit.
 */
export type BoardLayoutResolved = "stacked" | "lanes";

export interface BoardLayoutContextValue {
  boardId: number;
  layout: BoardLayoutResolved;
}

const BoardLayoutContext = createContext<BoardLayoutContextValue | null>(null);

export function BoardLayoutProvider({
  boardId,
  layout,
  children,
}: {
  boardId: number;
  layout: BoardLayoutResolved;
  children: ReactNode;
}) {
  const value = useMemo(
    (): BoardLayoutContextValue => ({ boardId, layout }),
    [boardId, layout],
  );
  return (
    <BoardLayoutContext.Provider value={value}>
      {children}
    </BoardLayoutContext.Provider>
  );
}

export function useBoardLayout(): BoardLayoutContextValue {
  // React 19: prefer `use()` over `useContext()` (vercel-composition-patterns round 2).
  const ctx = use(BoardLayoutContext);
  if (!ctx) {
    throw new Error("useBoardLayout must be used within BoardLayoutProvider");
  }
  return ctx;
}
