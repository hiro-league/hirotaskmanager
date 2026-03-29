import type { List } from "../../../shared/models";
import { Cell } from "./Cell";

interface StatusRowProps {
  boardId: string;
  statusLabel: string;
  lists: List[];
}

/** One matrix row: status label + one cell per list. */
export function StatusRow({ boardId, statusLabel, lists }: StatusRowProps) {
  return (
    <>
      <div
        className="flex min-h-[120px] items-start border border-border bg-muted/20 px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        role="rowheader"
      >
        {statusLabel}
      </div>
      {lists.map((list) => (
        <Cell key={list.id} boardId={boardId} listId={list.id} />
      ))}
    </>
  );
}
