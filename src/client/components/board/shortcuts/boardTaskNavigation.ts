import {
  listColumnTasksSorted,
  type BoardTaskFilterState,
} from "../boardStatusUtils";
import type { Board } from "../../../../shared/models";

export type BoardLayoutNav = "lanes" | "stacked";

/**
 * Ordered task ids per list column, matching visual order (lanes: statuses top→bottom
 * then order; stacked: merged workflow order within the list).
 */
export function buildListColumnTaskIds(
  board: Board,
  layout: BoardLayoutNav,
  listIdsInOrder: number[],
  filter: BoardTaskFilterState,
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const listId of listIdsInOrder) {
    const tasks = listColumnTasksSorted(board, layout, listId, filter);
    map.set(
      listId,
      tasks.map((t) => t.id),
    );
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

/** First list in column order: its first visible task, or the list header if the column is empty. */
export function initialHighlightForFirstList(
  listIdsInOrder: number[],
  columnMap: Map<number, number[]>,
): { kind: "task"; taskId: number } | { kind: "list"; listId: number } | null {
  const firstListId = listIdsInOrder[0];
  if (firstListId === undefined) return null;
  const ids = columnMap.get(firstListId) ?? [];
  if (ids.length > 0) return { kind: "task", taskId: ids[0]! };
  return { kind: "list", listId: firstListId };
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
