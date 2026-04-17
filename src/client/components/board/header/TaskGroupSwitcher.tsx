import { startTransition, useMemo } from "react";
import {
  formatGroupDisplayLabel,
  sortTaskGroupsForDisplay,
  type Board,
} from "../../../../shared/models";
import { EMPTY_SORTABLE_IDS } from "@/components/board/dnd/dndIds";
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
  const groupsOrdered = useMemo(
    () => sortTaskGroupsForDisplay(board.taskGroups),
    [board.taskGroups],
  );
  const activeGroupIds = useResolvedActiveTaskGroupIds(board.boardId, board.taskGroups);
  const options = useMemo(
    () =>
      groupsOrdered.map((group) => ({
        id: String(group.groupId),
        label: formatGroupDisplayLabel(group),
      })),
    [groupsOrdered],
  );

  return (
    <BoardHeaderMultiSelect
      sectionLabel="Groups"
      allLabel="All Groups"
      chooseAriaLabel="Choose task groups"
      clearAllLabel="Clear all groups"
      removeItemAriaLabel={(label) => `Remove ${label}`}
      options={options}
      selectedIds={activeGroupIds ?? EMPTY_SORTABLE_IDS}
      headerHovered={headerHovered}
      onChange={(nextSelectedIds) =>
        startTransition(() =>
          setActive(
            board.boardId,
            nextSelectedIds.length > 0 ? nextSelectedIds : undefined,
          ),
        )
      }
      onOpenEditor={onOpenGroupsEditor}
      editButtonAriaLabel="Edit task groups"
    />
  );
}
