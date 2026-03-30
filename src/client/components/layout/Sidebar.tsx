import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Plus, Trash2, X } from "lucide-react";
import { fetchBoard, useBoards } from "@/api/queries";
import {
  useCreateBoard,
  useDeleteBoard,
  useUpdateBoard,
} from "@/api/mutations";
import { cn } from "@/lib/utils";
import { boardPath } from "@/lib/boardPath";
import { usePreferencesStore } from "@/store/preferences";
import { useMatch, useNavigate } from "react-router-dom";

function boardCollapsedLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const a = words[0][0] ?? "";
  const b = words[1][0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function Sidebar() {
  const sidebarCollapsed = usePreferencesStore((s) => s.sidebarCollapsed);
  const { data: boards = [], isLoading, isError, error } = useBoards();
  const navigate = useNavigate();
  const boardMatch = useMatch({ path: "/board/:boardId", end: true });
  const selectedBoardId = boardMatch?.params.boardId ?? null;
  const createBoard = useCreateBoard();
  const updateBoard = useUpdateBoard();
  const deleteBoard = useDeleteBoard();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingBoard, setAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

  useEffect(() => {
    setAddingBoard(false);
    setNewBoardName("");
  }, [sidebarCollapsed]);

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

  const cancelAddBoard = useCallback(() => {
    setAddingBoard(false);
    setNewBoardName("");
  }, []);

  const submitNewBoard = useCallback(() => {
    const trimmed = newBoardName.trim();
    if (!trimmed) return;
    createBoard.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          cancelAddBoard();
        },
      },
    );
  }, [cancelAddBoard, createBoard, newBoardName]);

  if (sidebarCollapsed) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex justify-center border-b border-sidebar-border py-3">
          <LayoutGrid
            className="size-5 shrink-0 text-sidebar-primary"
            aria-hidden
          />
        </div>

        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-2">
          {isLoading && (
            <span
              className="size-9 animate-pulse rounded-md bg-sidebar-accent/50"
              aria-hidden
            />
          )}
          {isError && (
            <span
              className="text-destructive"
              title={error instanceof Error ? error.message : "Failed to load"}
            >
              !
            </span>
          )}
          {!isLoading &&
            !isError &&
            boards.map((b) => {
              const active = b.id === selectedBoardId;
              const label = boardCollapsedLabel(b.name);
              return (
                <button
                  key={b.id}
                  type="button"
                  title={b.name}
                  aria-label={b.name}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold leading-none tracking-tight transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                  onClick={() => navigate(boardPath(b.id))}
                >
                  {label}
                </button>
              );
            })}
        </div>
      </div>
    );
  }

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
            No boards yet.
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
                      onClick={() => navigate(boardPath(b.id))}
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
        {!addingBoard ? (
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-sidebar-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:bg-sidebar-accent/30 hover:text-foreground"
            disabled={createBoard.isPending}
            onClick={() => setAddingBoard(true)}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            Add board
          </button>
        ) : (
          <div className="mt-2 rounded-md border border-sidebar-border bg-sidebar-accent/20 p-2">
            <input
              autoFocus
              type="text"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="Board name…"
              value={newBoardName}
              disabled={createBoard.isPending}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNewBoard();
                }
                if (e.key === "Escape") cancelAddBoard();
              }}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-sidebar-primary px-3 py-1.5 text-sm font-medium text-sidebar-primary-foreground hover:opacity-90 disabled:opacity-50"
                disabled={createBoard.isPending || !newBoardName.trim()}
                onClick={() => submitNewBoard()}
              >
                Add board
              </button>
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Cancel"
                disabled={createBoard.isPending}
                onClick={cancelAddBoard}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
