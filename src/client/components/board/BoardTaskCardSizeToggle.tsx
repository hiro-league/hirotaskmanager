import { useMemo } from "react";
import type { Board } from "../../../shared/models";
import {
  usePreferencesStore,
  useResolvedTaskCardSize,
  type TaskCardSizePreference,
} from "@/store/preferences";

const TASK_CARD_SIZE_ORDER: TaskCardSizePreference[] = [
  "normal",
  "large",
  "larger",
  "small",
];

const TASK_CARD_SIZE_LABELS: Record<TaskCardSizePreference, string> = {
  normal: "Normal",
  large: "Large",
  larger: "Larger",
  small: "Small",
};

interface BoardTaskCardSizeToggleProps {
  board: Board;
}

export function BoardTaskCardSizeToggle({
  board,
}: BoardTaskCardSizeToggleProps) {
  const size = useResolvedTaskCardSize(board.id);
  const setTaskCardSizeForBoard = usePreferencesStore(
    (s) => s.setTaskCardSizeForBoard,
  );

  const nextSize = useMemo(() => {
    const index = TASK_CARD_SIZE_ORDER.indexOf(size);
    return TASK_CARD_SIZE_ORDER[(index + 1) % TASK_CARD_SIZE_ORDER.length] ?? "normal";
  }, [size]);

  return (
    <button
      type="button"
      className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
      title={`Task card size: ${TASK_CARD_SIZE_LABELS[size]}. Click to switch to ${TASK_CARD_SIZE_LABELS[nextSize]}.`}
      aria-label={`Task card size: ${TASK_CARD_SIZE_LABELS[size]}`}
      // Persist the cycle now so the future visual sizing can read the same board-local preference.
      onClick={() => setTaskCardSizeForBoard(board.id, nextSize)}
    >
      {`Card: ${TASK_CARD_SIZE_LABELS[size]}`}
    </button>
  );
}
