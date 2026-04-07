import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type RefCallback,
} from "react";
import { MoreVertical } from "lucide-react";
import { useDeleteList, usePatchList } from "@/api/mutations";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import { ConfirmDialog } from "@/components/board/shortcuts/ConfirmDialog";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { useShortcutOverlay } from "@/components/board/shortcuts/ShortcutScopeContext";
import { cn } from "@/lib/utils";
import { listDisplayName, type List } from "../../../shared/models";

interface ListHeaderProps {
  boardId: number;
  list: List;
  /** Attach the list drag handle for board column sorting. */
  dragHandleRef?: RefCallback<HTMLElement>;
}

function ListEmojiPicker({
  emoji,
  busy,
  onPickEmoji,
  onValidationError,
}: {
  emoji: string | null | undefined;
  busy: boolean;
  onPickEmoji: (next: string | null) => void;
  onValidationError: (message: string) => void;
}) {
  return (
    <div
      className={cn(
        "shrink-0 transition-opacity duration-150",
        "opacity-0 group-hover/list-header:opacity-100 focus-within:opacity-100",
        "[&_button[data-state=open]]:opacity-100",
      )}
    >
      <EmojiPickerMenuButton
        emoji={emoji}
        disabled={busy}
        compact
        alwaysShowPlaceholder
        placeholderIcon={
          <span className="text-[0.875rem] leading-none" aria-hidden>
            ❔
          </span>
        }
        onValidationError={onValidationError}
        chooseAriaLabel="Choose list emoji"
        selectedAriaLabel={(e) => `Change list emoji (${e})`}
        onPick={onPickEmoji}
      />
    </div>
  );
}

export function ListHeader({
  boardId,
  list,
  dragHandleRef,
}: ListHeaderProps) {
  const patchList = usePatchList();
  const deleteList = useDeleteList();
  const boardNav = useBoardKeyboardNavOptional();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(list.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listDeleteConfirmOpen, setListDeleteConfirmOpen] = useState(false);
  const [emojiFieldError, setEmojiFieldError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const boardDrag = dragHandleRef != null;
  const busy = patchList.isPending;

  const baseName = list.name.trim() || String(list.id);
  const emojiChar = list.emoji?.trim() || null;

  const startRename = useCallback(() => {
    // Keep the list current when rename is entered so canceling leaves the
    // user's last-touched list selected.
    boardNav?.selectList(list.id);
    setEditing(true);
    setEditValue(list.name);
  }, [boardNav, list.id, list.name]);

  // F2 on a keyboard-selected list calls the same entry point as click / ⋮ Rename.
  useEffect(() => {
    if (!boardNav) return;
    return boardNav.registerListRename(list.id, startRename);
  }, [boardNav, list.id, startRename]);

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
      await patchList.mutateAsync({
        boardId,
        listId: list.id,
        patch: { name: trimmed },
      });
    } catch {
      setEditValue(list.name);
    }
  }, [boardId, editValue, list.id, list.name, patchList]);

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

  const displayName = listDisplayName(list);

  const pickListEmoji = useCallback(
    (next: string | null) => {
      setEmojiFieldError(null);
      void patchList.mutateAsync({
        boardId,
        listId: list.id,
        patch: { emoji: next },
      });
    },
    [boardId, list.id, patchList],
  );

  const titleLine = (
    <>
      {emojiChar ? (
        <span className="shrink-0 text-[0.9375rem] leading-tight" aria-hidden>
          {emojiChar}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{baseName}</span>
    </>
  );

  return (
    <>
    <div
      className={cn(
        "group/list-header relative flex w-full min-h-10 items-center justify-end gap-1 border-border bg-muted/40 px-2 py-1.5",
        boardDrag ? "border-b border-border/80" : "rounded-t-md border border-b-0",
      )}
      onPointerDown={() => {
        // Any direct interaction with the header should make this list current.
        boardNav?.selectList(list.id);
      }}
    >
      {emojiFieldError ? (
        <p className="absolute left-2 top-full z-20 mt-0.5 max-w-[min(100%,12rem)] text-[10px] text-destructive">
          {emojiFieldError}
        </p>
      ) : null}
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1 pr-8">
          <ListEmojiPicker
            emoji={list.emoji}
            busy={busy}
            onValidationError={setEmojiFieldError}
            onPickEmoji={pickListEmoji}
          />
          {emojiChar ? (
            <span className="shrink-0 text-lg leading-none" aria-hidden>
              {emojiChar}
            </span>
          ) : null}
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground select-text"
            value={editValue}
            disabled={busy}
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
        </div>
      ) : boardDrag ? (
        <>
          <div className="pointer-events-none min-w-0 flex-1" aria-hidden />
          <div
            ref={dragHandleRef}
            className="absolute inset-y-0 left-2 right-10 z-[1] flex cursor-grab touch-none items-center justify-center gap-1 active:cursor-grabbing"
            // List-column drag now waits for pointer movement, so a plain click
            // on the title can reliably enter rename mode again.
            onClick={() => {
              if (!editing) startRename();
            }}
          >
            <div
              className="pointer-events-auto flex shrink-0 items-center"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ListEmojiPicker
                emoji={list.emoji}
                busy={busy}
                onValidationError={setEmojiFieldError}
                onPickEmoji={pickListEmoji}
              />
            </div>
            <span className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate text-center text-[0.9375rem] font-bold leading-tight text-foreground">
              {titleLine}
            </span>
          </div>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
          <ListEmojiPicker
            emoji={list.emoji}
            busy={busy}
            onValidationError={setEmojiFieldError}
            onPickEmoji={pickListEmoji}
          />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded px-1 py-0.5 text-center text-[0.9375rem] font-bold leading-tight text-foreground hover:bg-muted/80"
            onClick={startRename}
          >
            {titleLine}
          </button>
        </div>
      )}
      {!editing && (
        <div ref={menuRef} className="relative z-10 shrink-0">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted/80 group-hover/list-header:opacity-100 data-[open]:opacity-100"
            aria-label={`Actions for ${displayName}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            data-open={menuOpen ? "" : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreVertical className="size-4" aria-hidden />
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
                Move to Trash
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>

      <ConfirmDialog
        open={listDeleteConfirmOpen}
        scope="list-delete-confirmation"
        title="Move this list to Trash?"
        message={`Move list “${displayName}” to Trash? Its tasks move with it; you can restore from Trash or delete permanently there.`}
        confirmLabel="Move to Trash"
        cancelLabel="Cancel"
        variant="destructive"
        onCancel={() => setListDeleteConfirmOpen(false)}
        onConfirm={confirmListDelete}
      />
  </>
  );
}
