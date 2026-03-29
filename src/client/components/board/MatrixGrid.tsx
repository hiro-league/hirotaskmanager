import type { Board } from "../../../shared/models";
import { ListHeader } from "@/components/list/ListHeader";
import { StatusRow } from "./StatusRow";

interface MatrixGridProps {
  board: Board;
}

function sortedLists(board: Board) {
  return [...board.lists].sort((a, b) => a.order - b.order);
}

export function MatrixGrid({ board }: MatrixGridProps) {
  const lists = sortedLists(board);
  const statusLabel =
    board.visibleStatuses[0] ??
    board.statusDefinitions[0] ??
    "open";

  const cols = `minmax(5rem,auto) repeat(${lists.length}, minmax(11rem,1fr))`;

  return (
    <div
      className="mt-6 grid w-full gap-px overflow-x-auto rounded-lg border border-border bg-border"
      style={{ gridTemplateColumns: cols }}
    >
      <div className="min-h-10 rounded-tl-md bg-muted/30" aria-hidden />
      {lists.map((list) => (
        <div key={list.id} className="min-w-0">
          <ListHeader boardId={board.id} list={list} />
        </div>
      ))}
      <StatusRow boardId={board.id} statusLabel={statusLabel} lists={lists} />
    </div>
  );
}
