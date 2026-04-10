import { useDeleteList } from "@/api/mutations";
import { listDisplayName, type Board } from "../../../../shared/models";
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
    listId != null ? board.lists.find((l) => l.listId === listId) : undefined;

  return (
    <ConfirmDialog
      open={open}
      scope="list-delete-confirmation"
      title="Move this list to Trash?"
      message={
        list
          ? `Move list “${listDisplayName(list)}” to Trash? Its tasks move with it; you can restore from Trash or delete permanently there.`
          : "Move this list to Trash? Its tasks move with it; you can restore from Trash or delete permanently there."
      }
      confirmLabel="Move to Trash"
      cancelLabel="Cancel"
      variant="destructive"
      onCancel={onClose}
      onConfirm={() => {
        if (listId == null) return;
        deleteList.mutate(
          { boardId: board.boardId, listId },
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
