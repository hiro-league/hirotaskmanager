import type { Board } from "../../../../shared/models";
import { useBoardLayout } from "@/context/BoardLayoutContext";
import { BoardColumns } from "./BoardColumns";
import { BoardColumnsStacked } from "./BoardColumnsStacked";

/** Renders `BoardColumnsStacked` or `BoardColumns` from `BoardLayoutProvider` — keeps the parent free of a layout boolean. */
export function BoardColumnsResolved({ board }: { board: Board }) {
  const { layout } = useBoardLayout();
  return layout === "stacked" ? (
    <BoardColumnsStacked board={board} />
  ) : (
    <BoardColumns board={board} />
  );
}
