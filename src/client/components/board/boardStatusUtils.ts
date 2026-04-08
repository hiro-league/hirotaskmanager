import { DEFAULT_STATUS_IDS, type Board, type Task } from "../../../shared/models";
import {
  taskMatchesBoardFilter as taskMatchesBoardFilterShared,
  visibleStatusesForBoard as visibleStatusesForBoardShared,
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

function statusOrderIndex(
  status: string,
  workflowOrder: readonly string[],
): number {
  const i = workflowOrder.indexOf(status);
  return i >= 0 ? i : 0;
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
  return board.tasks
    .filter(
      (task) =>
        task.listId === listId &&
        task.status === status &&
        taskMatchesBoardFilter(task, filter),
    )
    .sort((a, b) => a.order - b.order);
}

/**
 * Tasks for a list in stacked view: filter by visible statuses and active group,
 * then sort by workflow order then band order.
 */
export function listTasksMergedSorted(
  board: Board,
  listId: number,
  filter: BoardTaskFilterState,
): Task[] {
  const vis = new Set(filter.visibleStatuses);
  const tasks = board.tasks.filter(
    (task) =>
      task.listId === listId &&
      vis.has(task.status) &&
      taskMatchesBoardFilter(task, filter),
  );
  return [...tasks].sort((a, b) => {
    const da = statusOrderIndex(a.status, filter.workflowOrder);
    const db = statusOrderIndex(b.status, filter.workflowOrder);
    if (da !== db) return da - db;
    return a.order - b.order;
  });
}

export function listColumnTasksSorted(
  board: Board,
  layout: "lanes" | "stacked",
  listId: number,
  filter: BoardTaskFilterState,
): Task[] {
  if (layout === "stacked") {
    return listTasksMergedSorted(board, listId, filter);
  }
  return filter.visibleStatuses.flatMap((status) =>
    listStatusTasksSorted(board, listId, status, filter),
  );
}
