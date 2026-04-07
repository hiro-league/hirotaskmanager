import { Pencil } from "lucide-react";
import {
  priorityDisplayLabel,
  sortPrioritiesByValue,
  type Board,
} from "../../../shared/models";
import {
  usePreferencesStore,
  useResolvedActiveTaskPriorityIds,
} from "@/store/preferences";
import {
  BOARD_HEADER_FILTER_SECTION_LABEL_CLASS,
  BOARD_HEADER_SECTION_EDIT_ICON_SLOT_CLASS,
  boardHeaderSectionEditIconButtonClass,
  boardHeaderToggleButtonClass,
} from "./boardHeaderButtonStyles";

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
  const setActive = usePreferencesStore((s) => s.setActiveTaskPriorityIdsForBoard);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.id,
    board.taskPriorities,
  );
  const orderedPriorities = sortPrioritiesByValue(board.taskPriorities);

  const toggle = (priorityId: string) => {
    if (activePriorityIds === null) {
      setActive(board.id, [priorityId]);
      return;
    }
    const next = activePriorityIds.includes(priorityId)
      ? activePriorityIds.filter((id) => id !== priorityId)
      : [...activePriorityIds, priorityId];
    const orderedIds = orderedPriorities.map((priority) => String(priority.id));
    setActive(
      board.id,
      orderedIds.filter((id) => next.includes(id)),
    );
  };

  const reserveEditSlot = onOpenPriorityEditor != null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Task priority filter"
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
              aria-label="Edit task priorities"
              title="Edit task priorities"
              onClick={(e) => {
                e.stopPropagation();
                onOpenPriorityEditor?.();
              }}
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          </span>
        ) : null}
        <span className={BOARD_HEADER_FILTER_SECTION_LABEL_CLASS}>Priority</span>
      </span>
      <button
        type="button"
        className={boardHeaderToggleButtonClass(activePriorityIds === null)}
        aria-pressed={activePriorityIds === null}
        onClick={() => setActive(board.id, undefined)}
      >
        All
      </button>
      {orderedPriorities.map((priority) => {
        const id = String(priority.id);
        const active = activePriorityIds?.includes(id) ?? false;
        return (
          <button
            key={priority.id}
            type="button"
            className={boardHeaderToggleButtonClass(active)}
            aria-pressed={active}
            onClick={() => toggle(id)}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-full border border-black/30"
                style={{ backgroundColor: priority.color }}
                aria-hidden
              />
              <span>{priorityDisplayLabel(priority.label)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
