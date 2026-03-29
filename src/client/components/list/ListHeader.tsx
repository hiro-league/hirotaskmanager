import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { useDeleteList, useRenameList } from "@/api/mutations";
import { cn } from "@/lib/utils";
import type { List } from "../../../shared/models";

interface ListHeaderProps {
  boardId: string;
  list: List;
}

export function ListHeader({ boardId, list }: ListHeaderProps) {
  const renameList = useRenameList();
  const deleteList = useDeleteList();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(list.name);

  const startRename = useCallback(() => {
    setEditing(true);
    setEditValue(list.name);
  }, [list.name]);

  const cancelRename = useCallback(() => {
    setEditing(false);
    setEditValue(list.name);
  }, [list.name]);

  const commitRename = useCallback(async () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (!trimmed || trimmed === list.name) {
      setEditValue(list.name);
      return;
    }
    try {
      await renameList.mutateAsync({
        boardId,
        listId: list.id,
        name: trimmed,
      });
    } catch {
      setEditValue(list.name);
    }
  }, [boardId, editValue, list.id, list.name, renameList]);

  const handleDelete = useCallback(() => {
    if (
      !window.confirm(
        `Delete list “${list.name}”? Tasks in this list will be removed.`,
      )
    ) {
      return;
    }
    deleteList.mutate({ boardId, listId: list.id });
  }, [boardId, deleteList, list.id, list.name]);

  return (
    <div
      className={cn(
        "group flex min-h-10 items-center gap-1 rounded-t-md border border-b-0 border-border bg-muted/40 px-2 py-1.5",
      )}
    >
      {editing ? (
        <input
          autoFocus
          className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              cancelRename();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm font-medium text-foreground hover:bg-muted/80"
          onDoubleClick={startRename}
        >
          {list.name}
        </button>
      )}
      {!editing && (
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          aria-label={`Delete ${list.name}`}
          onClick={handleDelete}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
