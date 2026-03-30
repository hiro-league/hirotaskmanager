import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { MoreVertical } from "lucide-react";
import { useDeleteList, useRenameList } from "@/api/mutations";
import { cn } from "@/lib/utils";
import type { List } from "../../../shared/models";

const TAP_MOVE_THRESHOLD_SQ = 8 * 8;

interface ListHeaderProps {
  boardId: number;
  list: List;
  /** When set, the title strip is the list drag handle (board columns). */
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
}

function mergeTapAwareListeners(
  listeners: DraggableSyntheticListeners | undefined,
  tapRef: React.MutableRefObject<{
    x: number;
    y: number;
    moved: boolean;
  } | null>,
  onTap: () => void,
  editing: boolean,
): DraggableSyntheticListeners | undefined {
  if (!listeners) return undefined;
  return {
    ...listeners,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!editing) {
        tapRef.current = { x: e.clientX, y: e.clientY, moved: false };
      }
      listeners.onPointerDown?.(e);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const t = tapRef.current;
      if (t && !t.moved) {
        const dx = e.clientX - t.x;
        const dy = e.clientY - t.y;
        if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD_SQ) t.moved = true;
      }
      listeners.onPointerMove?.(e);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const t = tapRef.current;
      if (t && !t.moved && !editing) {
        onTap();
      }
      tapRef.current = null;
      listeners.onPointerUp?.(e);
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      tapRef.current = null;
      listeners.onPointerCancel?.(e);
    },
  };
}

export function ListHeader({
  boardId,
  list,
  dragAttributes,
  dragListeners,
}: ListHeaderProps) {
  const renameList = useRenameList();
  const deleteList = useDeleteList();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(list.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tapRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const boardDrag = dragAttributes !== undefined && dragListeners !== undefined;

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

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

  const mergedListeners = boardDrag
    ? mergeTapAwareListeners(dragListeners, tapRef, startRename, editing)
    : dragListeners;

  return (
    <div
      className={cn(
        "group relative flex w-full min-h-10 items-center justify-end gap-1 border-border bg-muted/40 px-2 py-1.5",
        boardDrag ? "border-b border-border/80" : "rounded-t-md border border-b-0",
      )}
    >
      {editing ? (
        <input
          autoFocus
          className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
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
            className="absolute inset-y-0 left-2 right-10 z-[1] flex cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            {...dragAttributes}
            {...(mergedListeners ?? {})}
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
                  setMenuOpen(false);
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
  );
}
