import { DEFAULT_STATUS_IDS, type Board, type Task } from "../../../shared/models";
import {
  taskMatchesBoardFilter as taskMatchesBoardFilterShared,
  visibleStatusesForBoard as visibleStatusesForBoardShared,
  visibleStatusesFromStored,
  type ActiveTaskGroupIds,
  type TaskDateFilterResolved,
} from "../../../shared/boardFilters";

export type {
  ActiveTaskGroupIds,
  ActiveTaskPriorityIds,
  TaskDateFilterMode,
  TaskDateFilterResolved,
} from "../../../shared/boardFilters";
export {
  isValidYmd,
  localCalendarDateKeyFromIso,
  taskMatchesDateFilter,
  todayDateKeyLocal,
} from "../../../shared/boardFilters";

export { taskMatchesPriorityFilter } from "../../../shared/boardFilters";

export interface BoardTaskFilterState {
  visibleStatuses: readonly string[];
  workflowOrder: readonly string[];
  activeGroupIds: ActiveTaskGroupIds;
  activePriorityIds: import("../../../shared/boardFilters").ActiveTaskPriorityIds;
  activeReleaseIds: import("../../../shared/boardFilters").ActiveReleaseIds;
  dateFilter: TaskDateFilterResolved | null;
}

export { visibleStatusesFromStored };

/** Statuses shown on the board, in workflow order (`GET /api/statuses`). */
export function visibleStatusesForBoard(
  board: Board,
  workflowOrder: readonly string[] = [...DEFAULT_STATUS_IDS],
): string[] {
  return visibleStatusesForBoardShared(board, workflowOrder);
}

export function bandWeightsForBoard(
  board: Board,
  workflowOrder: readonly string[] = [...DEFAULT_STATUS_IDS],
): number[] {
  const vis = visibleStatusesForBoardShared(board, workflowOrder);
  const stored = board.statusBandWeights;
  if (
    stored &&
    stored.length === vis.length &&
    stored.every((n) => Number.isFinite(n) && n > 0)
  ) {
    return [...stored];
  }
  return vis.map(() => 1);
}

/** When visibility changes, carry over weights for kept statuses; new ones get 1; then normalize. */
export function weightsAfterVisibilityChange(
  prevStatuses: string[],
  prevWeights: number[],
  nextStatuses: string[],
): number[] {
  const map = new Map(
    prevStatuses.map((s, i) => [s, prevWeights[i] ?? 1] as const),
  );
  const raw = nextStatuses.map((s) => map.get(s) ?? 1);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const target = nextStatuses.length;
  return raw.map((w) => (w / sum) * target);
}

// Re-export shared implementation under the name used by board components.
export function taskMatchesBoardFilter(
  task: Task,
  filter: Pick<
    BoardTaskFilterState,
    | "activeGroupIds"
    | "activePriorityIds"
    | "activeReleaseIds"
    | "dateFilter"
  >,
): boolean {
  return taskMatchesBoardFilterShared(task, {
    activeGroupIds: filter.activeGroupIds,
    activePriorityIds: filter.activePriorityIds,
    activeReleaseIds: filter.activeReleaseIds,
    dateFilter: filter.dateFilter,
  });
}

/** Map key for tasks grouped by list + workflow status (`listId:status`). */
export function listStatusBandKey(listId: number, status: string): string {
  return `${listId}:${status}`;
}

/**
 * Pre-index board tasks by (listId, status) in one O(N) pass; each bucket sorted by `order`.
 * Memoize on `board.tasks` reference at a single ancestor (see board perf plan #3) so bands
 * avoid scanning the full task array per render.
 */
export function buildTasksByListStatusIndex(
  tasks: readonly Task[],
): Map<string, Task[]> {
  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = listStatusBandKey(task.listId, task.status);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(task);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.order - b.order);
  }
  return buckets;
}

export function listStatusTasksSortedFromIndex(
  index: ReadonlyMap<string, readonly Task[]>,
  listId: number,
  status: string,
  filter: Pick<
    BoardTaskFilterState,
    | "activeGroupIds"
    | "activePriorityIds"
    | "activeReleaseIds"
    | "dateFilter"
  >,
): Task[] {
  const bucket = index.get(listStatusBandKey(listId, status));
  if (!bucket?.length) return [];
  const out: Task[] = [];
  for (const task of bucket) {
    if (taskMatchesBoardFilter(task, filter)) out.push(task);
  }
  return out;
}

export function listStatusTasksSorted(
  board: Board,
  listId: number,
  status: string,
  filter: Pick<
    BoardTaskFilterState,
    | "activeGroupIds"
    | "activePriorityIds"
    | "activeReleaseIds"
    | "dateFilter"
  >,
): Task[] {
  return listStatusTasksSortedFromIndex(
    buildTasksByListStatusIndex(board.tasks),
    listId,
    status,
    filter,
  );
}

/**
 * Tasks for a list in stacked view: filter by visible statuses and active group,
 * then sort by workflow order then band order.
 */
export function listTasksMergedSortedFromIndex(
  index: ReadonlyMap<string, readonly Task[]>,
  listId: number,
  filter: BoardTaskFilterState,
): Task[] {
  const vis = new Set(filter.visibleStatuses);
  const wo = filter.workflowOrder;
  const statusOrderIndex = (status: string) => {
    const i = wo.indexOf(status);
    // Match legacy `listTasksMergedSorted`: unknown status sorts with workflow index 0.
    return i >= 0 ? i : 0;
  };
  const collected: Task[] = [];
  for (const status of vis) {
    const bucket = index.get(listStatusBandKey(listId, status));
    if (!bucket?.length) continue;
    for (const task of bucket) {
      if (taskMatchesBoardFilter(task, filter)) collected.push(task);
    }
  }
  return collected.sort((a, b) => {
    const da = statusOrderIndex(a.status);
    const db = statusOrderIndex(b.status);
    if (da !== db) return da - db;
    return a.order - b.order;
  });
}

export function listTasksMergedSorted(
  board: Board,
  listId: number,
  filter: BoardTaskFilterState,
): Task[] {
  return listTasksMergedSortedFromIndex(
    buildTasksByListStatusIndex(board.tasks),
    listId,
    filter,
  );
}

export function listColumnTasksSortedFromIndex(
  index: ReadonlyMap<string, readonly Task[]>,
  layout: "lanes" | "stacked",
  listId: number,
  filter: BoardTaskFilterState,
): Task[] {
  if (layout === "stacked") {
    return listTasksMergedSortedFromIndex(index, listId, filter);
  }
  return filter.visibleStatuses.flatMap((status) =>
    listStatusTasksSortedFromIndex(index, listId, status, filter),
  );
}

export function listColumnTasksSorted(
  board: Board,
  layout: "lanes" | "stacked",
  listId: number,
  filter: BoardTaskFilterState,
): Task[] {
  return listColumnTasksSortedFromIndex(
    buildTasksByListStatusIndex(board.tasks),
    layout,
    listId,
    filter,
  );
}
