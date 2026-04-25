import { useCallback, useState } from "react";
import type { BoardIndexEntry } from "../../../shared/models";
import { useCreateBoard, usePatchBoard } from "@/api/mutations";
import { reportMutationError } from "@/lib/mutationErrorUi";
import { useTrashBoardWithUndo } from "@/lib/trashWithUndo";

export function useSidebarBoardMutations(boards: BoardIndexEntry[]) {
  const createBoard = useCreateBoard();
  const patchBoard = usePatchBoard();
  const trashBoardWithUndo = useTrashBoardWithUndo();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingBoard, setAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
    } catch (err) {
      reportMutationError("rename board", err);
    }
  }, [boards, cancelRename, editValue, editingId, patchBoard]);

  // Board soft-delete: no modal (#31351); toast offers Undo (restore) and Trash.
  const requestDelete = useCallback(
    (id: number, name: string) => {
      setOpenMenuId(null);
      trashBoardWithUndo({ boardId: id, label: name });
    },
    [trashBoardWithUndo],
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
        onError: (err) => reportMutationError("create board", err),
      },
    );
  }, [cancelAddBoard, createBoard, newBoardName]);

  return {
    createBoard,
    editingId,
    editValue,
    setEditValue,
    addingBoard,
    setAddingBoard,
    newBoardName,
    setNewBoardName,
    openMenuId,
    setOpenMenuId,
    startRename,
    cancelRename,
    commitRename,
    requestDelete,
    cancelAddBoard,
    submitNewBoard,
  };
}
