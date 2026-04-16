import { CollisionPriority } from "@dnd-kit/abstract";
import { useDroppable } from "@dnd-kit/react";
import {
  BOARD_TASK_CONTAINER_DND_TYPE,
  BOARD_TASK_DND_TYPE,
  type BoardDndLayout,
  boardTaskContainerData,
} from "./dndReactModel";

/**
 * Phase 1 React-first wrapper for task drop containers.
 * This encodes the board's container metadata once so stacked lists and lane
 * bands can share the same droppable configuration in later phases.
 */
export function useBoardTaskContainerDroppableReact({
  containerId,
  layout,
  listId,
  status,
}: {
  containerId: string;
  layout: BoardDndLayout;
  listId: number;
  status?: string;
}) {
  return useDroppable({
    id: containerId,
    type: BOARD_TASK_CONTAINER_DND_TYPE,
    accept: BOARD_TASK_DND_TYPE,
    collisionPriority: CollisionPriority.Low,
    data: boardTaskContainerData(containerId, layout, listId, status),
  });
}
