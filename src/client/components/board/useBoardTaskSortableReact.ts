import { useSortable } from "@dnd-kit/react/sortable";
import { BOARD_TASK_DND_TYPE, boardTaskDragData } from "./dndReactModel";

/**
 * Phase 1 React-first wrapper for sortable task rows.
 * Group and index are explicit so grouped multi-list movement can follow the
 * official multiple-sortable-lists approach during later phases.
 */
export function useBoardTaskSortableReact(
  taskId: number,
  sortableId: string,
  containerId: string,
  index: number,
) {
  return useSortable({
    id: sortableId,
    index,
    group: containerId,
    type: BOARD_TASK_DND_TYPE,
    accept: BOARD_TASK_DND_TYPE,
    // Mirror the working board-list route so task drags use the same
    // React-first feedback clone behavior as columns.
    feedback: "clone",
    data: boardTaskDragData(taskId, containerId),
  });
}
