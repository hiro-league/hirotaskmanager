import {
  priorityDisplayLabel,
  sortPrioritiesByValue,
  type Board,
} from "../../../../shared/models";
import {
  useBoardFiltersStore,
  useResolvedActiveTaskPriorityIds,
} from "@/store/preferences";
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
  const orderedPriorities = sortPrioritiesByValue(board.taskPriorities);
  const options = orderedPriorities.map((priority) => ({
    id: String(priority.priorityId),
    label: priorityDisplayLabel(priority.label),
    color: priority.color,
  }));

  return (
    <BoardHeaderMultiSelect
      sectionLabel="Priority"
      allLabel="All Priorities"
      chooseAriaLabel="Choose task priorities"
      clearAllLabel="Clear all priorities"
      removeItemAriaLabel={(label) => `Remove ${label}`}
      options={options}
      selectedIds={activePriorityIds ?? []}
      headerHovered={headerHovered}
      onChange={(nextSelectedIds) =>
        setActive(board.boardId, nextSelectedIds.length > 0 ? nextSelectedIds : undefined)
      }
      onOpenEditor={onOpenPriorityEditor}
      editButtonAriaLabel="Edit task priorities"
    />
  );
}
