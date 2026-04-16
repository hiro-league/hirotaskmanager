import { useEffect } from "react";
import { LayoutGrid, Plus, Trash2, X } from "lucide-react";
import { useBoards } from "@/api/queries";
import { cn } from "@/lib/utils";
import { boardPath } from "@/lib/boardPath";
import { useBoardFiltersStore, usePreferencesStore } from "@/store/preferences";
import { NavLink, useMatch, useNavigate } from "react-router-dom";
import { boardDisplayName } from "../../../shared/models";
import { boardCollapsedLabel } from "@/components/layout/boardCollapsedLabel";
import { SidebarBoardItem } from "@/components/layout/SidebarBoardItem";
import { SidebarConfirmDialog } from "@/components/layout/SidebarConfirmDialog";
import { SettingsSidebarMenu } from "@/components/layout/SettingsSidebarMenu";
import { useSidebarBoardMutations } from "@/components/layout/useSidebarBoardMutations";

export function Sidebar() {
  const sidebarCollapsed = usePreferencesStore((s) => s.sidebarCollapsed);
  const pruneBoardScopedPreferences = useBoardFiltersStore(
    (s) => s.pruneBoardScopedPreferences,
  );
  const { data: boards = [], isLoading, isError, error } = useBoards();
  const navigate = useNavigate();
  const boardMatch = useMatch({ path: "/board/:boardId", end: true });
  const settingsMatch = useMatch({ path: "/settings", end: true });
  const trashMatch = useMatch({ path: "/trash", end: true });
  const selectedBoardId = boardMatch?.params.boardId ?? null;

  const {
    createBoard,
    deleteBoard,
    editingId,
    editValue,
    setEditValue,
    addingBoard,
    setAddingBoard,
    newBoardName,
    setNewBoardName,
    openMenuId,
    setOpenMenuId,
    boardDeleteCandidate,
    setBoardDeleteCandidate,
    deleteTaskCountInput,
    setDeleteTaskCountInput,
    startRename,
    cancelRename,
    commitRename,
    requestDelete,
    confirmDelete,
    cancelAddBoard,
    submitNewBoard,
    deleteTaskCountKnown,
    deleteTaskCount,
    requiresTypedDeleteConfirmation,
    deleteTaskCountMatches,
    deleteConfirmDisabled,
  } = useSidebarBoardMutations(boards);

  useEffect(() => {
    setAddingBoard(false);
    setNewBoardName("");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (isLoading || isError) return;
    // Keep persisted board-local UI prefs aligned with the real board list so deleted boards
    // cannot leak their filter state onto a later board that reuses the same SQLite id.
    pruneBoardScopedPreferences(boards.map((board) => board.boardId));
  }, [boards, isError, isLoading, pruneBoardScopedPreferences]);

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
              const active = String(b.boardId) === selectedBoardId;
              const label = boardCollapsedLabel(b.name, b.emoji);
              const display = boardDisplayName(b);
              return (
                <button
                  key={b.boardId}
                  type="button"
                  title={display}
                  aria-label={display}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold leading-none tracking-tight transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                  onClick={() => navigate(boardPath(String(b.boardId)))}
                >
                  {label}
                </button>
              );
            })}
        </div>

        <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border p-2">
          <NavLink
            to="/trash"
            title="Trash"
            aria-current={trashMatch ? "page" : undefined}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center justify-center rounded-md p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
              )
            }
          >
            <Trash2 className="size-5 shrink-0" aria-hidden />
          </NavLink>
          <SettingsSidebarMenu
            collapsed
            settingsActive={Boolean(settingsMatch)}
          />
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

      <div className="flex min-h-0 flex-1 flex-col">
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
            const active = String(b.boardId) === selectedBoardId;
            const idStr = String(b.boardId);
            return (
              <SidebarBoardItem
                key={b.boardId}
                board={b}
                active={active}
                editing={idStr === editingId}
                editValue={editValue}
                menuOpen={idStr === openMenuId}
                onNavigate={() => navigate(boardPath(idStr))}
                onDoubleClickRename={() => startRename(b.boardId, b.name)}
                onRenameFromMenu={() => {
                  setOpenMenuId(null);
                  startRename(b.boardId, b.name);
                }}
                onEditValueChange={setEditValue}
                onRenameCommit={commitRename}
                onRenameCancel={cancelRename}
                onMenuOpenChange={(open) => setOpenMenuId(open ? idStr : null)}
                onRequestDelete={() => requestDelete(b.boardId, b.name)}
              />
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

      <div className="border-t border-sidebar-border p-2">
        <NavLink
          to="/trash"
          aria-current={trashMatch ? "page" : undefined}
          className={({ isActive }) =>
            cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
            )
          }
        >
          <Trash2 className="size-4 shrink-0" aria-hidden />
          Trash
        </NavLink>
        <SettingsSidebarMenu
          collapsed={false}
          settingsActive={Boolean(settingsMatch)}
        />
      </div>
      </div>

      {/* Sidebar sits outside the board shortcut scope, so board deletion uses a local app dialog instead of `window.confirm`. */}
      <SidebarConfirmDialog
        open={boardDeleteCandidate !== null}
        title="Move this board to Trash?"
        message={
          boardDeleteCandidate
            ? `Move board “${boardDeleteCandidate.name}” to Trash? You can restore it later from Trash, or delete it permanently there.`
            : ""
        }
        confirmLabel="Move to Trash"
        cancelLabel="Cancel"
        busy={deleteBoard.isPending}
        confirmDisabled={deleteConfirmDisabled}
        onCancel={() => {
          if (!deleteBoard.isPending) {
            setBoardDeleteCandidate(null);
            setDeleteTaskCountInput("");
          }
        }}
        onConfirm={confirmDelete}
      >
        {!deleteTaskCountKnown ? (
          <p className="text-sm text-muted-foreground">Loading task count…</p>
        ) : requiresTypedDeleteConfirmation ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-destructive">
              This board has {deleteTaskCount} tasks. Are you sure you want to
              move it to Trash?
            </p>
            {/* Require the exact task count before moving a board with tasks to Trash so it is harder to do by mistake than for an empty board. */}
            <div className="space-y-1.5">
              <label
                htmlFor="sidebar-delete-board-task-count"
                className="text-sm text-foreground"
              >
                To move to Trash, type the number of tasks below.
              </label>
              <input
                id="sidebar-delete-board-task-count"
                type="text"
                inputMode="numeric"
                autoFocus
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={deleteTaskCountInput}
                disabled={deleteBoard.isPending}
                onChange={(e) => setDeleteTaskCountInput(e.target.value)}
              />
              {!deleteTaskCountMatches && deleteTaskCountInput.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Enter `{deleteTaskCount}` to enable Move to Trash.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </SidebarConfirmDialog>
    </div>
  );
}
