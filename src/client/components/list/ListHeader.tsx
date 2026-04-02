import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type RefCallback,
} from "react";
import { MoreVertical } from "lucide-react";
import { useDeleteList, useRenameList } from "@/api/mutations";
import { ConfirmDialog } from "@/components/board/shortcuts/ConfirmDialog";
import { useShortcutOverlay } from "@/components/board/shortcuts/ShortcutScopeContext";
import { cn } from "@/lib/utils";
import type { List } from "../../../shared/models";

interface ListHeaderProps {
  boardId: number;
  list: List;
  /** Attach the list drag handle for board column sorting. */
  dragHandleRef?: RefCallback<HTMLElement>;
}

export function ListHeader({
  boardId,
  list,
  dragHandleRef,
}: ListHeaderProps) {
  const renameList = useRenameList();
  const deleteList = useDeleteList();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(list.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listDeleteConfirmOpen, setListDeleteConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const boardDrag = dragHandleRef != null;

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

  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointerDown = (e: Event) => {
      const el = menuRef.current;
      const t = e.target;
      if (el && t instanceof Node && !el.contains(t)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [menuOpen]);

  // Phase 4: Esc for list menu goes through scoped shortcut stack (board shortcuts stay suppressed).
  useShortcutOverlay(
    menuOpen,
    "list-header-menu",
    useCallback((e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMenuOpen(false);
    }, []),
  );

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    setListDeleteConfirmOpen(true);
  }, []);

  const confirmListDelete = useCallback(() => {
    deleteList.mutate({ boardId, listId: list.id });
    setListDeleteConfirmOpen(false);
  }, [boardId, deleteList, list.id]);

  return (
    <>
    <div
      className={cn(
        "group relative flex w-full min-h-10 items-center justify-end gap-1 border-border bg-muted/40 px-2 py-1.5",
        boardDrag ? "border-b border-border/80" : "rounded-t-md border border-b-0",
      )}
    >
      {editing ? (
        // Inline rename restores selection so the board's drag surface does not swallow text editing behavior.
        <input
          autoFocus
          className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground select-text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
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
      ) : boardDrag ? (
        <>
          <div className="pointer-events-none min-w-0 flex-1" aria-hidden />
          <div
            ref={dragHandleRef}
            className="absolute inset-y-0 left-2 right-10 z-[1] flex cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            // The React-first sortable handle is ref-based, so keep an explicit
            // double-click rename affordance on the handle itself.
            onDoubleClick={() => {
              if (!editing) startRename();
            }}
          >
            <span className="w-full truncate text-center text-[0.9375rem] font-bold leading-tight text-foreground">
              {list.name}
            </span>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-center text-[0.9375rem] font-bold leading-tight text-foreground hover:bg-muted/80"
          onDoubleClick={startRename}
        >
          {list.name}
        </button>
      )}
      {!editing && (
        <div ref={menuRef} className="relative z-10 shrink-0">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted/80 group-hover:opacity-100 data-[open]:opacity-100"
            aria-label={`Actions for ${list.name}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            data-open={menuOpen ? "" : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreVertical className="size-4" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[9.5rem] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full rounded px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setMenuOpen(false);
                  startRename();
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                onClick={() => {
                  handleDelete();
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>

      <ConfirmDialog
        open={listDeleteConfirmOpen}
        scope="list-delete-confirmation"
        title="Delete this list?"
        message={`Delete list “${list.name}”? Tasks in this list will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onCancel={() => setListDeleteConfirmOpen(false)}
        onConfirm={confirmListDelete}
      />
  </>
  );
}
