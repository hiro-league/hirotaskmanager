import type { Board } from "../../../shared/models";
import { ALL_TASK_GROUPS } from "../../../shared/models";
import { usePreferencesStore } from "@/store/preferences";
import {
  BOARD_HEADER_FILTER_SECTION_LABEL_CLASS,
  boardHeaderToggleButtonClass,
} from "./boardHeaderButtonStyles";

interface TaskGroupSwitcherProps {
  board: Board;
}

export function TaskGroupSwitcher({ board }: TaskGroupSwitcherProps) {
  const setActive = usePreferencesStore((s) => s.setActiveTaskGroupForBoard);
  const raw = usePreferencesStore(
    (s) => s.activeTaskGroupByBoardId[String(board.id)],
  );

  const resolved =
    raw === ALL_TASK_GROUPS
      ? ALL_TASK_GROUPS
      : raw && board.taskGroups.some((g) => String(g.id) === raw)
        ? raw
        : ALL_TASK_GROUPS;

  const pick = (value: string) => {
    setActive(board.id, value);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Task group filter"
    >
      <span className={BOARD_HEADER_FILTER_SECTION_LABEL_CLASS}>Groups</span>
      <button
        type="button"
        className={boardHeaderToggleButtonClass(resolved === ALL_TASK_GROUPS)}
        aria-pressed={resolved === ALL_TASK_GROUPS}
        onClick={() => pick(ALL_TASK_GROUPS)}
      >
        All groups
      </button>
      {board.taskGroups.map((g) => {
        const active = resolved === String(g.id);
        return (
          <button
            key={g.id}
            type="button"
            className={boardHeaderToggleButtonClass(active)}
            aria-pressed={active}
            onClick={() => pick(String(g.id))}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
