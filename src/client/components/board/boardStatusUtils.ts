import {
  ALL_TASK_GROUPS,
  TASK_STATUSES,
  type Board,
  type Task,
  type TaskStatus,
} from "../../../shared/models";

/** Statuses shown on the board, in fixed workflow order. */
export function visibleStatusesForBoard(board: Board): string[] {
  const vis = board.visibleStatuses.filter((s) =>
    (TASK_STATUSES as readonly string[]).includes(s),
  );
  if (vis.length > 0) {
    return TASK_STATUSES.filter((s) => vis.includes(s));
  }
  return [...TASK_STATUSES];
}

export function bandWeightsForBoard(board: Board): number[] {
  const vis = visibleStatusesForBoard(board);
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

function statusOrderIndex(status: TaskStatus): number {
  const i = TASK_STATUSES.indexOf(status);
  return i >= 0 ? i : 0;
}

/**
 * Tasks for a list in stacked view: filter by visible statuses and active group,
 * then sort by workflow order then band order.
 */
export function listTasksMergedSorted(
  board: Board,
  listId: string,
  visibleStatuses: string[],
  activeGroup: string,
): Task[] {
  const vis = new Set(visibleStatuses);
  let tasks = board.tasks.filter(
    (t) => t.listId === listId && vis.has(t.status),
  );
  if (activeGroup !== ALL_TASK_GROUPS) {
    tasks = tasks.filter((t) => t.group === activeGroup);
  }
  return [...tasks].sort((a, b) => {
    const da = statusOrderIndex(a.status);
    const db = statusOrderIndex(b.status);
    if (da !== db) return da - db;
    return a.order - b.order;
  });
}
