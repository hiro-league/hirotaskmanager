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
import { statusDotClass } from "./laneStatusTheme";
import {
  BOARD_HEADER_FILTER_SECTION_LABEL_CLASS,
  boardHeaderToggleButtonClass,
} from "./boardHeaderButtonStyles";

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
      <span className={BOARD_HEADER_FILTER_SECTION_LABEL_CLASS}>Status</span>
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
            className={boardHeaderToggleButtonClass(active)}
            aria-pressed={active}
            onPointerDown={stopPan}
            onClick={() => toggle(statusId)}
          >
            {/* Mirror the board lane colors in the header so each workflow state reads faster at a glance. */}
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full border border-black",
                  statusDotClass(statusId),
                )}
                aria-hidden
              />
              <span>{label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
