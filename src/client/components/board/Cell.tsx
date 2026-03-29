interface CellProps {
  boardId: string;
  listId: string;
}

/** Empty task cell placeholder (tasks in Phase 4). */
export function Cell({ boardId, listId }: CellProps) {
  return (
    <div
      className="min-h-[120px] rounded-b-md border border-t-0 border-dashed border-border bg-background/50"
      data-board-id={boardId}
      data-list-id={listId}
      aria-label="Task cell"
    />
  );
}
