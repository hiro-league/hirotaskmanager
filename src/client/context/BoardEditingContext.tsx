import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { usePatchBoard } from "@/api/mutations";
import type { Board } from "../../shared/models";

/** Board title inline rename: state lived in BoardView and was drilled into BoardHeader; provider isolates updates to the header subtree (composition review #1). */
export interface BoardEditingContextValue {
  editingBoardName: boolean;
  setEditingBoardName: (value: boolean) => void;
  boardNameDraft: string;
  setBoardNameDraft: (value: string) => void;
  boardNameInputRef: RefObject<HTMLInputElement | null>;
  boardNameBlurModeRef: MutableRefObject<"commit" | "cancel">;
  commitBoardRename: () => void | Promise<void>;
  cancelBoardRename: () => void;
}

const BoardEditingContext = createContext<BoardEditingContextValue | null>(
  null,
);

export function useBoardEditing(): BoardEditingContextValue {
  const ctx = use(BoardEditingContext);
  if (!ctx) {
    throw new Error("useBoardEditing must be used within BoardEditingProvider");
  }
  return ctx;
}

export function BoardEditingProvider({
  board,
  children,
}: {
  board: Board;
  children: ReactNode;
}) {
  const patchBoard = usePatchBoard();
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState(board.name);
  const boardNameDraftRef = useRef(boardNameDraft);
  boardNameDraftRef.current = boardNameDraft;
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const boardNameBlurModeRef = useRef<"commit" | "cancel">("commit");

  // Board switch resets editing state via `key={board.boardId}` on the provider (BoardView) — §2.3.

  useEffect(() => {
    if (!editingBoardName) return;
    boardNameInputRef.current?.focus();
    boardNameInputRef.current?.select();
  }, [editingBoardName]);

  const cancelBoardRename = useCallback(() => {
    boardNameBlurModeRef.current = "cancel";
    setEditingBoardName(false);
    setBoardNameDraft(board.name);
  }, [board.name]);

  const commitBoardRename = useCallback(async () => {
    boardNameBlurModeRef.current = "commit";
    setEditingBoardName(false);
    const trimmed = boardNameDraftRef.current.trim();
    if (!trimmed || trimmed === board.name) {
      setBoardNameDraft(board.name);
      return;
    }
    try {
      await patchBoard.mutateAsync({
        boardId: board.boardId,
        name: trimmed,
      });
    } catch {
      setBoardNameDraft(board.name);
    }
  }, [board, patchBoard]);

  const value = useMemo(
    (): BoardEditingContextValue => ({
      editingBoardName,
      setEditingBoardName,
      boardNameDraft,
      setBoardNameDraft,
      boardNameInputRef,
      boardNameBlurModeRef,
      commitBoardRename,
      cancelBoardRename,
    }),
    [
      editingBoardName,
      boardNameDraft,
      commitBoardRename,
      cancelBoardRename,
    ],
  );

  return (
    <BoardEditingContext.Provider value={value}>
      {children}
    </BoardEditingContext.Provider>
  );
}
