import { useCallback, useState } from "react";
import type { BoardIndexEntry } from "../../../shared/models";
import { useCreateBoard, useDeleteBoard, usePatchBoard } from "@/api/mutations";
import { reportMutationError } from "@/lib/mutationErrorUi";
import { useBoard } from "@/api/queries";

export function useSidebarBoardMutations(boards: BoardIndexEntry[]) {
  const createBoard = useCreateBoard();
  const patchBoard = usePatchBoard();
  const deleteBoard = useDeleteBoard();

  const [editingId, setEditingId] = useState<string | null>(null);
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
      onError: (err) => reportMutationError("delete board", err),
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
        onError: (err) => reportMutationError("create board", err),
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

  return {
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
    deleteBoardDetailsLoading,
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
  };
}
