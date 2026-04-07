import { LayoutGrid } from "lucide-react";
import { useMemo } from "react";
import type { Board } from "../../../shared/models";
import {
  getNextTaskCardViewMode,
  TASK_CARD_VIEW_MODE_LABELS,
  TASK_CARD_VIEW_MODE_SHORT,
  usePreferencesStore,
  useResolvedTaskCardViewMode,
} from "@/store/preferences";
import { cn } from "@/lib/utils";
import { boardHeaderActionButtonClass } from "./boardHeaderButtonStyles";

interface BoardTaskCardSizeToggleProps {
  board: Board;
}

export function BoardTaskCardSizeToggle({
  board,
}: BoardTaskCardSizeToggleProps) {
  const viewMode = useResolvedTaskCardViewMode(board.id);
  const setTaskCardViewModeForBoard = usePreferencesStore(
    (s) => s.setTaskCardViewModeForBoard,
  );

  const nextSize = useMemo(() => {
    return getNextTaskCardViewMode(viewMode);
  }, [viewMode]);

  return (
    <button
      type="button"
      className={cn(
        boardHeaderActionButtonClass(),
        "h-8 min-h-8 gap-1 px-1.5 py-0",
      )}
      title="Card Size (s)"
      aria-label={`Task card size ${TASK_CARD_VIEW_MODE_LABELS[viewMode]}. Click or press S for ${TASK_CARD_VIEW_MODE_LABELS[nextSize]}.`}
      // Keep the board-local mode in one place so the button and shortcut stay in sync.
      onClick={() => setTaskCardViewModeForBoard(board.id, nextSize)}
    >
      <LayoutGrid className="size-3.5 shrink-0" aria-hidden />
      <span className="inline-block min-w-[1.75rem] text-center text-xs font-semibold tabular-nums leading-none">
        {TASK_CARD_VIEW_MODE_SHORT[viewMode]}
      </span>
    </button>
  );
}
