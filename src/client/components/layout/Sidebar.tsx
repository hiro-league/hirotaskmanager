import { useCallback, useState } from "react";
import { LayoutGrid, Plus, Trash2 } from "lucide-react";
import { fetchBoard, useBoards } from "@/api/queries";
import {
  useCreateBoard,
  useDeleteBoard,
  useUpdateBoard,
} from "@/api/mutations";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/store/selection";

export function Sidebar() {
  const { data: boards = [], isLoading, isError, error } = useBoards();
  const selectedBoardId = useSelectionStore((s) => s.selectedBoardId);
  const setSelectedBoardId = useSelectionStore((s) => s.setSelectedBoardId);
  const createBoard = useCreateBoard();
  const updateBoard = useUpdateBoard();
  const deleteBoard = useDeleteBoard();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startRename = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
  }, []);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  const commitRename = useCallback(async () => {
    if (!editingId) return;
    const id = editingId;
    const trimmed = editValue.trim();
    cancelRename();
    if (!trimmed) return;
    const row = boards.find((b) => b.id === id);
    if (!row || row.name === trimmed) return;
    try {
      const board = await fetchBoard(id);
      await updateBoard.mutateAsync({ ...board, name: trimmed });
    } catch {
      /* toast in a later phase */
    }
  }, [boards, cancelRename, editValue, editingId, updateBoard]);

  const handleDelete = useCallback(
    (id: string, name: string) => {
      if (!window.confirm(`Delete board “${name}”? This cannot be undone.`)) {
        return;
      }
      deleteBoard.mutate(id);
    },
    [deleteBoard],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-3">
        <LayoutGrid className="size-5 shrink-0 text-sidebar-primary" aria-hidden />
        <span className="font-semibold tracking-tight">Boards</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <p className="px-2 py-2 text-sm text-muted-foreground">Loading…</p>
        )}
        {isError && (
          <p className="px-2 py-2 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load boards"}
          </p>
        )}
        {!isLoading && !isError && boards.length === 0 && (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            No boards yet. Create one below.
          </p>
        )}
        <ul className="space-y-0.5">
          {boards.map((b) => {
            const active = b.id === selectedBoardId;
            const editing = b.id === editingId;
            return (
              <li key={b.id}>
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-md transition-colors",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  {editing ? (
                    <input
                      autoFocus
                      className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
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
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm",
                        !active && "hover:bg-sidebar-accent/50",
                      )}
                      onClick={() => setSelectedBoardId(b.id)}
                      onDoubleClick={() => startRename(b.id, b.name)}
                    >
                      {b.name}
                    </button>
                  )}
                  {!editing && (
                    <button
                      type="button"
                      className="rounded p-1.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label={`Delete ${b.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(b.id, b.name);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-sidebar-primary px-3 py-2 text-sm font-medium text-sidebar-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={createBoard.isPending}
          onClick={() => createBoard.mutate({})}
        >
          <Plus className="size-4" aria-hidden />
          New board
        </button>
      </div>
    </div>
  );
}
