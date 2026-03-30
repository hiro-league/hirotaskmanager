import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { BoardView } from "@/components/board/BoardView";
import { LAST_BOARD_STORAGE_KEY } from "@/lib/boardPath";

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();

  useEffect(() => {
    if (boardId) {
      localStorage.setItem(LAST_BOARD_STORAGE_KEY, boardId);
    }
  }, [boardId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BoardView boardId={boardId ?? null} />
    </div>
  );
}
