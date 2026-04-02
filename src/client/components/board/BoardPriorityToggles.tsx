import {
  priorityDisplayLabel,
  sortPrioritiesByValue,
  type Board,
} from "../../../shared/models";
import {
  usePreferencesStore,
  useResolvedActiveTaskPriorityIds,
} from "@/store/preferences";
import { boardHeaderToggleButtonClass } from "./boardHeaderButtonStyles";

interface BoardPriorityTogglesProps {
  board: Board;
}

export function BoardPriorityToggles({ board }: BoardPriorityTogglesProps) {
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

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Task priority filter"
    >
      <span className="text-xs font-medium text-muted-foreground">Priority</span>
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
