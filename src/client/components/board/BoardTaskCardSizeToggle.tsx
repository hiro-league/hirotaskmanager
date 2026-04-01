import { useMemo } from "react";
import type { Board } from "../../../shared/models";
import {
  getNextTaskCardViewMode,
  TASK_CARD_VIEW_MODE_LABELS,
  usePreferencesStore,
  useResolvedTaskCardViewMode,
} from "@/store/preferences";
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
      className={boardHeaderActionButtonClass()}
      title={`Task card view: ${TASK_CARD_VIEW_MODE_LABELS[viewMode]}. Click or press S to switch to ${TASK_CARD_VIEW_MODE_LABELS[nextSize]}.`}
      aria-label={`Task card view: ${TASK_CARD_VIEW_MODE_LABELS[viewMode]}`}
      // Keep the board-local mode in one place so the button and shortcut stay in sync.
      onClick={() => setTaskCardViewModeForBoard(board.id, nextSize)}
    >
      {`Card: ${TASK_CARD_VIEW_MODE_LABELS[viewMode]}`}
    </button>
  );
}
