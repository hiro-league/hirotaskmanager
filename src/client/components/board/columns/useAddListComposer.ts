import { useCallback, useEffect, useState } from "react";
import { useBoardKeyboardNavOptional } from "../shortcuts/BoardKeyboardNavContext";

/**
 * Inline “Add list” composer state shared by lanes and stacked column layouts so count/open
 * logic and keyboard registration stay in one place.
 */
export function useAddListComposer(boardId: number) {
  const boardKeyboardNav = useBoardKeyboardNavOptional();
  const [addListOpen, setAddListOpen] = useState(false);
  const [insertAfterListId, setInsertAfterListId] = useState<number | null>(null);

  useEffect(() => {
    setAddListOpen(false);
    setInsertAfterListId(null);
  }, [boardId]);

  useEffect(() => {
    return boardKeyboardNav?.registerOpenAddListComposer((anchorListId) => {
      // Render the inline composer in-place after the anchor list so keyboard `L`
      // opens exactly where the new list will land.
      setInsertAfterListId(anchorListId);
      setAddListOpen(true);
    });
  }, [boardKeyboardNav]);

  const closeAddList = useCallback(() => {
    setAddListOpen(false);
    setInsertAfterListId(null);
  }, []);

  const onOpenTrailingAddList = useCallback(
    (anchorListId: number | null) => {
      setInsertAfterListId(anchorListId);
      setAddListOpen(true);
    },
    [],
  );

  return {
    addListOpen,
    insertAfterListId,
    setInsertAfterListId,
    closeAddList,
    onOpenTrailingAddList,
  };
}
