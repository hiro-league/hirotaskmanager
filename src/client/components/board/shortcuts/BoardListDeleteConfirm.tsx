import { useDeleteList } from "@/api/mutations";
import type { Board } from "../../../../shared/models";
import { useBoardKeyboardNav } from "./BoardKeyboardNavContext";
import { ConfirmDialog } from "./ConfirmDialog";

interface BoardListDeleteConfirmProps {
  board: Board;
  listId: number | null;
  onClose: () => void;
}

/**
 * Board-scoped list delete confirmation for the Delete key when a list header is selected.
 * Matches the list header ⋮ menu delete action (same API and copy as {@link ListHeader}).
 */
export function BoardListDeleteConfirm({
  board,
  listId,
  onClose,
}: BoardListDeleteConfirmProps) {
  const nav = useBoardKeyboardNav();
  const deleteList = useDeleteList();
  const open = listId != null;
  const list =
    listId != null ? board.lists.find((l) => l.id === listId) : undefined;

  return (
    <ConfirmDialog
      open={open}
      scope="list-delete-keyboard-confirmation"
      title="Delete this list?"
      message={
        list
          ? `Delete list “${list.name}”? Tasks in this list will be removed. This cannot be undone.`
          : "Delete this list? Tasks in this list will be removed. This cannot be undone."
      }
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="destructive"
      onCancel={onClose}
      onConfirm={() => {
        if (listId == null) return;
        deleteList.mutate(
          { boardId: board.id, listId },
          {
            onSuccess: () => {
              nav.setHighlightedListId(null);
              onClose();
            },
          },
        );
      }}
    />
  );
}
