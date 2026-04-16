import {
  formatGroupDisplayLabel,
  sortTaskGroupsForDisplay,
  type Board,
} from "../../../../shared/models";
import {
  useBoardFiltersStore,
  useResolvedActiveTaskGroupIds,
} from "@/store/preferences";
import { BoardHeaderMultiSelect } from "./BoardHeaderMultiSelect";

interface TaskGroupSwitcherProps {
  board: Board;
  /** Shown with the section label while the board header is hovered — opens the group editor. */
  headerHovered?: boolean;
  onOpenGroupsEditor?: () => void;
}

export function TaskGroupSwitcher({
  board,
  headerHovered,
  onOpenGroupsEditor,
}: TaskGroupSwitcherProps) {
  const setActive = useBoardFiltersStore((s) => s.setActiveTaskGroupIdsForBoard);
  const groupsOrdered = sortTaskGroupsForDisplay(board.taskGroups);
  const activeGroupIds = useResolvedActiveTaskGroupIds(board.boardId, board.taskGroups);
  const options = groupsOrdered.map((group) => ({
    id: String(group.groupId),
    label: formatGroupDisplayLabel(group),
  }));

  return (
    <BoardHeaderMultiSelect
      sectionLabel="Groups"
      allLabel="All Groups"
      chooseAriaLabel="Choose task groups"
      clearAllLabel="Clear all groups"
      removeItemAriaLabel={(label) => `Remove ${label}`}
      options={options}
      selectedIds={activeGroupIds ?? []}
      headerHovered={headerHovered}
      onChange={(nextSelectedIds) =>
        setActive(board.boardId, nextSelectedIds.length > 0 ? nextSelectedIds : undefined)
      }
      onOpenEditor={onOpenGroupsEditor}
      editButtonAriaLabel="Edit task groups"
    />
  );
}
