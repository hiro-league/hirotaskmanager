import { startTransition, useMemo } from "react";
import {
  priorityDisplayLabel,
  sortPrioritiesByValue,
  type Board,
} from "../../../../shared/models";
import {
  useBoardFiltersStore,
  useResolvedActiveTaskPriorityIds,
} from "@/store/preferences";
import { EMPTY_SORTABLE_IDS } from "@/components/board/dnd/dndIds";
import { BoardHeaderMultiSelect } from "./BoardHeaderMultiSelect";

interface BoardPriorityTogglesProps {
  board: Board;
  /** Shown with the section label while the board header is hovered — opens the priority editor. */
  headerHovered?: boolean;
  onOpenPriorityEditor?: () => void;
}

export function BoardPriorityToggles({
  board,
  headerHovered,
  onOpenPriorityEditor,
}: BoardPriorityTogglesProps) {
  const setActive = useBoardFiltersStore((s) => s.setActiveTaskPriorityIdsForBoard);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.boardId,
    board.taskPriorities,
  );
  const orderedPriorities = useMemo(
    () => sortPrioritiesByValue(board.taskPriorities),
    [board.taskPriorities],
  );
  const options = useMemo(
    () =>
      orderedPriorities.map((priority) => ({
        id: String(priority.priorityId),
        label: priorityDisplayLabel(priority.label),
        color: priority.color,
      })),
    [orderedPriorities],
  );

  return (
    <BoardHeaderMultiSelect
      sectionLabel="Priority"
      allLabel="All Priorities"
      chooseAriaLabel="Choose task priorities"
      clearAllLabel="Clear all priorities"
      removeItemAriaLabel={(label) => `Remove ${label}`}
      options={options}
      selectedIds={activePriorityIds ?? EMPTY_SORTABLE_IDS}
      headerHovered={headerHovered}
      onChange={(nextSelectedIds) =>
        startTransition(() =>
          setActive(
            board.boardId,
            nextSelectedIds.length > 0 ? nextSelectedIds : undefined,
          ),
        )
      }
      onOpenEditor={onOpenPriorityEditor}
      editButtonAriaLabel="Edit task priorities"
    />
  );
}
