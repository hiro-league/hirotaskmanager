import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutGrid,
  LogOut,
  MoreVertical,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useBoard, useBoards } from "@/api/queries";
import {
  useCreateBoard,
  useDeleteBoard,
  usePatchBoard,
} from "@/api/mutations";
import { cn } from "@/lib/utils";
import { boardPath } from "@/lib/boardPath";
import { useBackdropDismissClick } from "@/components/board/shortcuts/useBackdropDismissClick";
import { useModalFocusTrap } from "@/components/board/shortcuts/useModalFocusTrap";
import { usePreferencesStore } from "@/store/preferences";
import { NavLink, useMatch, useNavigate } from "react-router-dom";
import { useLogout } from "@/api/auth";
import type { ReactNode } from "react";
import { boardDisplayName } from "../../../shared/models";

/** Collapsed rail: one grapheme when board emoji is set, else initials from the name. */
function boardCollapsedLabel(name: string, emoji?: string | null): string {
  const e = emoji?.trim();
  if (e) {
    try {
      if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
        const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
        for (const { segment } of seg.segment(e)) {
          return segment;
        }
      }
    } catch {
      /* fall through */
    }
    return [...e][0] ?? "?";
  }
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

interface SidebarConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

function SidebarConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  busy = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: SidebarConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (!confirmDisabled && !busy) onConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, confirmDisabled, onCancel, onConfirm, open]);

  useModalFocusTrap({
    open,
    containerRef: dialogRef,
    initialFocusRef: cancelButtonRef,
  });

  const backdropDismiss = useBackdropDismissClick(onCancel, { disabled: busy });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onPointerDown={backdropDismiss.onPointerDown}
      onClick={backdropDismiss.onClick}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sidebar-delete-board-title"
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="sidebar-delete-board-title"
          className="text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {children ? <div className="mt-3">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            ref={cancelButtonRef}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Settings row opens a menu (settings, log out) so the list can grow without crowding the header. */
function SettingsSidebarMenu({
  collapsed,
  settingsActive,
}: {
  collapsed: boolean;
  settingsActive: boolean;
}) {
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Settings and account"
          aria-label="Settings and account menu"
          aria-current={settingsActive ? "page" : undefined}
          className={cn(
            collapsed
              ? "flex w-full items-center justify-center rounded-md p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"
              : "mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            settingsActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <Settings
            className={cn("shrink-0", collapsed ? "size-5" : "size-4")}
            aria-hidden
          />
          {!collapsed ? "Settings" : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="end"
          sideOffset={4}
          className="z-50 min-w-[10rem] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          <DropdownMenu.Item
            className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onSelect={() => navigate("/settings")}
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            Settings
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
            disabled={logout.isPending}
            onSelect={() => logout.mutate()}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Sidebar() {
  const sidebarCollapsed = usePreferencesStore((s) => s.sidebarCollapsed);
  const pruneBoardScopedPreferences = usePreferencesStore(
    (s) => s.pruneBoardScopedPreferences,
  );
  const { data: boards = [], isLoading, isError, error } = useBoards();
  const navigate = useNavigate();
  const boardMatch = useMatch({ path: "/board/:boardId", end: true });
  const settingsMatch = useMatch({ path: "/settings", end: true });
  const trashMatch = useMatch({ path: "/trash", end: true });
  const selectedBoardId = boardMatch?.params.boardId ?? null;
  const createBoard = useCreateBoard();
  const patchBoard = usePatchBoard();
  const deleteBoard = useDeleteBoard();

  const [editingId, setEditingId] = useState<string | null>(null); // String(board.boardId)
  const [editValue, setEditValue] = useState("");
  const [addingBoard, setAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [boardDeleteCandidate, setBoardDeleteCandidate] = useState<{
    boardId: number;
    name: string;
  } | null>(null);
  const [deleteTaskCountInput, setDeleteTaskCountInput] = useState("");
  const {
    data: deleteBoardDetails,
    isLoading: deleteBoardDetailsLoading,
  } = useBoard(boardDeleteCandidate?.boardId ?? null);

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

  const startRename = useCallback((id: number, name: string) => {
    setEditingId(String(id));
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
    const row = boards.find((b) => String(b.boardId) === id);
    if (!row || row.name === trimmed) return;
    try {
      await patchBoard.mutateAsync({
        boardId: Number(id),
        name: trimmed,
      });
    } catch {
      /* toast in a later phase */
    }
  }, [boards, cancelRename, editValue, editingId, patchBoard]);

  const requestDelete = useCallback((id: number, name: string) => {
    setOpenMenuId(null);
    setDeleteTaskCountInput("");
    setBoardDeleteCandidate({ boardId: id, name });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!boardDeleteCandidate) return;
    deleteBoard.mutate(boardDeleteCandidate.boardId, {
      onSuccess: () => {
        setBoardDeleteCandidate(null);
        setDeleteTaskCountInput("");
      },
    });
  }, [boardDeleteCandidate, deleteBoard]);

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

  const deleteTaskCountKnown =
    boardDeleteCandidate == null || (!deleteBoardDetailsLoading && !!deleteBoardDetails);
  const deleteTaskCount = deleteBoardDetails?.tasks.length ?? 0;
  const requiresTypedDeleteConfirmation = deleteTaskCountKnown && deleteTaskCount > 0;
  const deleteTaskCountMatches =
    Number(deleteTaskCountInput.trim()) === deleteTaskCount;
  const deleteConfirmDisabled =
    !deleteTaskCountKnown ||
    (requiresTypedDeleteConfirmation && !deleteTaskCountMatches);

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
            const editing = String(b.boardId) === editingId;
            const menuOpen = String(b.boardId) === openMenuId;
            return (
              <li key={b.boardId}>
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
                      onClick={() => navigate(boardPath(String(b.boardId)))}
                      onDoubleClick={() => startRename(b.boardId, b.name)}
                    >
                      {boardDisplayName(b)}
                    </button>
                  )}
                  {!editing && (
                    <DropdownMenu.Root
                      open={menuOpen}
                      onOpenChange={(open) =>
                        setOpenMenuId(open ? String(b.boardId) : null)
                      }
                    >
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          className="rounded p-1.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent/70 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
                          aria-label={`Actions for ${b.name}`}
                        >
                          <MoreVertical className="size-4" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={4}
                          className="z-50 min-w-[9.5rem] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
                        >
                          <DropdownMenu.Item
                            className="flex cursor-default rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                            onSelect={() => {
                              setOpenMenuId(null);
                              startRename(b.boardId, b.name);
                            }}
                          >
                            Edit
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="flex cursor-default rounded px-2 py-1.5 text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
                            onSelect={() => {
                              requestDelete(b.boardId, b.name);
                            }}
                          >
                            Move to Trash
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
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
