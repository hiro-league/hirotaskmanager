import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Board } from "../../../../shared/models";
import { useCreateList, useMoveList } from "@/api/mutations";
import { tempNumericId } from "@/api/mutations/shared";
import { boardKeys } from "@/api/queries";
import { reportMutationError } from "@/lib/mutationErrorUi";
import { useBoardKeyboardNavOptional } from "../shortcuts/BoardKeyboardNavContext";

/**
 * Inline “Add list” composer state shared by lanes and stacked column layouts so count/open
 * logic and keyboard registration stay in one place.
 *
 * Owns the create/move mutations so the per-call onSuccess callback survives slot key
 * changes when the composer advances after a chained add — keeping the mutation observer
 * inside `AddListSlot` would orphan it on remount and drop the optimistic→real id swap.
 */
export function useAddListComposer(boardId: number) {
  const qc = useQueryClient();
  const boardKeyboardNav = useBoardKeyboardNavOptional();
  const createList = useCreateList();
  const moveList = useMoveList();
  const [addListOpen, setAddListOpen] = useState(false);
  const [insertAfterListId, setInsertAfterListId] = useState<number | null>(null);

  useEffect(() => {
    setAddListOpen(false);
    setInsertAfterListId(null);
  }, [boardId]);

  useEffect(() => {
    return boardKeyboardNav?.registerOpenAddListComposer((anchorListId) => {
      setInsertAfterListId(anchorListId);
      setAddListOpen(true);
    });
  }, [boardKeyboardNav]);

  const closeAddList = useCallback(() => {
    setAddListOpen(false);
    setInsertAfterListId(null);
  }, []);

  const onOpenTrailingAddList = useCallback((anchorListId: number | null) => {
    setInsertAfterListId(anchorListId);
    setAddListOpen(true);
  }, []);

  /**
   * Create the next list at the current composer position and advance the
   * composer so the user can chain another. The mutation lives at hook scope
   * (above the slot) so the per-call onSuccess fires reliably even after the
   * inline slot remounts under a new key. On success the new list also gains
   * the keyboard highlight inline so the user can see what was just created
   * without waiting for the composer to close.
   */
  const submitList = useCallback(
    (input: { name: string; emoji: string | null }) => {
      const trimmed = input.name.trim();
      if (!trimmed) return;
      const beforeBoard = qc.getQueryData<Board>(boardKeys.detail(boardId));
      if (!beforeBoard) return;
      const prevOrder = [...beforeBoard.lists]
        .sort((x, y) => x.order - y.order)
        .map((l) => l.listId);
      const anchor = insertAfterListId;
      const optimisticId = tempNumericId();

      createList.mutate(
        {
          boardId,
          name: trimmed,
          emoji: input.emoji,
          optimisticListId: optimisticId,
        },
        {
          onSuccess: (data) => {
            const newList = data.entity;
            // Swap optimistic id for the server id so the inline composer key
            // matches the new list and stays mounted at the right column.
            setInsertAfterListId((prev) => (prev === optimisticId ? newList.listId : prev));
            // Move the keyboard highlight to the just-created list so users see
            // what was added without waiting for the composer to close.
            // selectList only updates the highlight ring + scrolls; it does not
            // steal focus from the composer input.
            boardKeyboardNav?.selectList(newList.listId);

            if (anchor == null) return;
            const anchorIdx = prevOrder.indexOf(anchor);
            if (anchorIdx < 0) return;
            const nextListId = prevOrder[anchorIdx + 1];
            moveList.mutate(
              {
                boardId: data.boardId,
                listId: newList.listId,
                beforeListId: nextListId == null ? undefined : nextListId,
                position: nextListId == null ? "last" : undefined,
              },
              {
                onError: (err) => reportMutationError("move list after create", err),
              },
            );
          },
          onError: (err) => reportMutationError("create list", err),
        },
      );

      setInsertAfterListId(optimisticId);
      setAddListOpen(true);
    },
    [boardId, qc, insertAfterListId, createList, moveList, boardKeyboardNav],
  );

  return {
    addListOpen,
    insertAfterListId,
    setInsertAfterListId,
    closeAddList,
    onOpenTrailingAddList,
    submitList,
    isPending: createList.isPending,
  };
}
