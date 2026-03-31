import { ALL_TASK_GROUPS, type Board } from "../../../../shared/models";
import { listTasksMergedSorted } from "../boardStatusUtils";

export type BoardLayoutNav = "lanes" | "stacked";

/**
 * Ordered task ids per list column, matching visual order (lanes: statuses top→bottom
 * then order; stacked: merged workflow order within the list).
 */
export function buildListColumnTaskIds(
  board: Board,
  layout: BoardLayoutNav,
  listIdsInOrder: number[],
  visibleStatuses: string[],
  workflowOrder: readonly string[],
  activeGroup: string,
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const listId of listIdsInOrder) {
    if (layout === "stacked") {
      const tasks = listTasksMergedSorted(
        board,
        listId,
        visibleStatuses,
        activeGroup,
        workflowOrder,
      );
      map.set(
        listId,
        tasks.map((t) => t.id),
      );
    } else {
      const ids: number[] = [];
      for (const status of visibleStatuses) {
        let tasks = board.tasks.filter(
          (t) => t.listId === listId && t.status === status,
        );
        if (activeGroup !== ALL_TASK_GROUPS) {
          tasks = tasks.filter((t) => String(t.groupId) === activeGroup);
        }
        tasks.sort((a, b) => a.order - b.order);
        ids.push(...tasks.map((t) => t.id));
      }
      map.set(listId, ids);
    }
  }
  return map;
}

export function findListIdForTask(
  columnMap: Map<number, number[]>,
  taskId: number,
): number | null {
  for (const [listId, ids] of columnMap) {
    if (ids.includes(taskId)) return listId;
  }
  return null;
}

export function findFirstTaskId(
  listIdsInOrder: number[],
  columnMap: Map<number, number[]>,
): number | null {
  for (const listId of listIdsInOrder) {
    const ids = columnMap.get(listId);
    if (ids && ids.length > 0) return ids[0]!;
  }
  return null;
}

export function findLastTaskId(
  listIdsInOrder: number[],
  columnMap: Map<number, number[]>,
): number | null {
  for (let i = listIdsInOrder.length - 1; i >= 0; i--) {
    const listId = listIdsInOrder[i]!;
    const ids = columnMap.get(listId);
    if (ids && ids.length > 0) return ids[ids.length - 1]!;
  }
  return null;
}

export const PAGE_STEP = 5;
