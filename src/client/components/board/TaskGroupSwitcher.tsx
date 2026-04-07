import { Pencil } from "lucide-react";
import {
  ALL_TASK_GROUPS,
  formatGroupDisplayLabel,
  sortTaskGroupsForDisplay,
  type Board,
} from "../../../shared/models";
import { usePreferencesStore } from "@/store/preferences";
import {
  BOARD_HEADER_FILTER_SECTION_LABEL_CLASS,
  BOARD_HEADER_SECTION_EDIT_ICON_SLOT_CLASS,
  boardHeaderSectionEditIconButtonClass,
  boardHeaderToggleButtonClass,
} from "./boardHeaderButtonStyles";

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
  const setActive = usePreferencesStore((s) => s.setActiveTaskGroupForBoard);
  const raw = usePreferencesStore(
    (s) => s.activeTaskGroupByBoardId[String(board.id)],
  );

  const groupsOrdered = sortTaskGroupsForDisplay(board.taskGroups);
  const resolved =
    raw === ALL_TASK_GROUPS
      ? ALL_TASK_GROUPS
      : raw && groupsOrdered.some((g) => String(g.id) === raw)
        ? raw
        : ALL_TASK_GROUPS;

  const pick = (value: string) => {
    setActive(board.id, value);
  };

  const reserveEditSlot = onOpenGroupsEditor != null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Task group filter"
    >
      <span className="inline-flex items-center gap-1">
        {reserveEditSlot ? (
          <span className={BOARD_HEADER_SECTION_EDIT_ICON_SLOT_CLASS}>
            <button
              type="button"
              tabIndex={headerHovered ? 0 : -1}
              className={boardHeaderSectionEditIconButtonClass(
                Boolean(headerHovered),
              )}
              aria-label="Edit task groups"
              title="Edit task groups"
              onClick={(e) => {
                e.stopPropagation();
                onOpenGroupsEditor?.();
              }}
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          </span>
        ) : null}
        <span className={BOARD_HEADER_FILTER_SECTION_LABEL_CLASS}>Groups</span>
      </span>
      <button
        type="button"
        className={boardHeaderToggleButtonClass(resolved === ALL_TASK_GROUPS)}
        aria-pressed={resolved === ALL_TASK_GROUPS}
        onClick={() => pick(ALL_TASK_GROUPS)}
      >
        All groups
      </button>
      {groupsOrdered.map((g) => {
        const active = resolved === String(g.id);
        return (
          <button
            key={g.id}
            type="button"
            className={boardHeaderToggleButtonClass(active)}
            aria-pressed={active}
            onClick={() => pick(String(g.id))}
          >
            {formatGroupDisplayLabel(g)}
          </button>
        );
      })}
    </div>
  );
}
