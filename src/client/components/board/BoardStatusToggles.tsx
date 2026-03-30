import type { PointerEvent } from "react";
import { usePatchBoardViewPrefs } from "@/api/mutations";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import type { Board } from "../../../shared/models";
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
  const patchViewPrefs = usePatchBoardViewPrefs();
  const { data: statuses } = useStatuses();
  const workflowOrder = useStatusWorkflowOrder();

  const toggle = (status: string) => {
    const current = visibleStatusesForBoard(board, workflowOrder);
    const isOn = current.includes(status);
    const prevWeights = bandWeightsForBoard(board, workflowOrder);

    let nextVis: string[];
    if (isOn) {
      if (current.length <= 1) return;
      nextVis = current.filter((s) => s !== status);
    } else {
      nextVis = workflowOrder.filter(
        (s) => current.includes(s) || s === status,
      );
    }

    const nextWeights = weightsAfterVisibilityChange(
      current,
      prevWeights,
      nextVis,
    );

    patchViewPrefs.mutate({
      boardId: board.id,
      patch: {
        visibleStatuses: nextVis,
        statusBandWeights: nextWeights,
      },
    });
  };

  const stopPan = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Show or hide task statuses"
    >
      <span className="text-xs font-medium text-muted-foreground">Statuses</span>
      {workflowOrder.map((statusId) => {
        const active = visibleStatusesForBoard(board, workflowOrder).includes(
          statusId,
        );
        const label =
          statuses?.find((s) => s.id === statusId)?.label ?? statusId;
        return (
          <button
            key={statusId}
            type="button"
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/15 text-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
            aria-pressed={active}
            onPointerDown={stopPan}
            onClick={() => toggle(statusId)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
