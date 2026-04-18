import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { boardKeys, useBoards } from "@/api/queries";
import { BoardView } from "@/components/board/BoardView";
import { RedirectCountdownNotice } from "@/components/routing/RedirectCountdownNotice";
import {
  boardPath,
  LAST_BOARD_STORAGE_KEY,
} from "@/lib/boardPath";

export function HomeRedirect() {
  const { data: boards, isLoading, isError, error } = useBoards();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLoading || isError) return;
    if (!boards?.length) return;
    const last = localStorage.getItem(LAST_BOARD_STORAGE_KEY);
    const pick =
      boards.find((b) => String(b.boardId) === last) ?? boards[0];
    navigate(boardPath(pick.boardId), { replace: true });
  }, [isLoading, isError, boards, navigate]);

  if (isError) {
    return (
      <RedirectCountdownNotice
        title="Couldn’t load boards"
        description="Check your connection or try again later."
        detail={
          error instanceof Error ? error.message : "Failed to load boards"
        }
        onRedirect={() => {
          // Already on `/` — replace alone won’t remount; invalidate so boards can refetch.
          void queryClient.invalidateQueries({ queryKey: boardKeys.all });
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-4 w-72 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (!boards?.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <BoardView boardId={null} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-8">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mt-4 h-4 w-72 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
