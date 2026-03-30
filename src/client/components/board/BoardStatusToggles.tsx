import { useUpdateBoard } from "@/api/mutations";
import { TASK_STATUSES, type Board } from "../../../shared/models";
import { cn } from "@/lib/utils";
import {
  bandWeightsForBoard,
  visibleStatusesForBoard,
  weightsAfterVisibilityChange,
} from "./boardStatusUtils";

interface BoardStatusTogglesProps {
  board: Board;
}

export function BoardStatusToggles({ board }: BoardStatusTogglesProps) {
  const updateBoard = useUpdateBoard();

  const toggle = (status: string) => {
    const current = visibleStatusesForBoard(board);
    const isOn = current.includes(status);
    const prevWeights = bandWeightsForBoard(board);

    let nextVis: string[];
    if (isOn) {
      if (current.length <= 1) return;
      nextVis = current.filter((s) => s !== status);
    } else {
      nextVis = TASK_STATUSES.filter(
        (s) => current.includes(s) || s === status,
      );
    }

    const nextWeights = weightsAfterVisibilityChange(
      current,
      prevWeights,
      nextVis,
    );

    updateBoard.mutate({
      ...board,
      visibleStatuses: nextVis,
      statusBandWeights: nextWeights,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Show or hide task statuses"
    >
      <span className="text-xs font-medium text-muted-foreground">Statuses</span>
      {TASK_STATUSES.map((status) => {
        const active = visibleStatusesForBoard(board).includes(status);
        return (
          <button
            key={status}
            type="button"
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/15 text-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
            aria-pressed={active}
            onClick={() => toggle(status)}
          >
            {status}
          </button>
        );
      })}
    </div>
  );
}
