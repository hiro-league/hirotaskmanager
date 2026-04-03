import {
  ALL_TASK_GROUPS,
  DEFAULT_STATUS_IDS,
  type Board,
  type Task,
} from "../../../shared/models";

export type ActiveTaskPriorityIds = string[] | null;

/** Which timestamps participate in the inclusive calendar-day range. */
export type TaskDateFilterMode = "opened" | "closed" | "any";

/** Normalized active filter (store may hold invalid ranges until resolved). */
export interface TaskDateFilterResolved {
  mode: TaskDateFilterMode;
  /** Local calendar days as `YYYY-MM-DD`, inclusive. */
  startDate: string;
  endDate: string;
}

/** Local calendar day for an ISO instant (for inclusive date-only filtering). */
export function localCalendarDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayDateKeyLocal(): string {
  return localCalendarDateKeyFromIso(new Date().toISOString());
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(`${s}T12:00:00`).getTime();
  return Number.isFinite(t);
}

function dateKeyInInclusiveRange(key: string, start: string, end: string): boolean {
  return key >= start && key <= end;
}

/**
 * Opened: `createdAt` in range. Closed: `closedAt` in range (no close → no match).
 * Any: `createdAt` in range OR `closedAt` in range.
 */
export function taskMatchesDateFilter(
  task: Task,
  filter: TaskDateFilterResolved,
): boolean {
  const { mode, startDate, endDate } = filter;
  const createdKey = localCalendarDateKeyFromIso(task.createdAt);
  const closedKey =
    task.closedAt != null ? localCalendarDateKeyFromIso(task.closedAt) : null;

  if (mode === "opened") {
    return dateKeyInInclusiveRange(createdKey, startDate, endDate);
  }
  if (mode === "closed") {
    if (closedKey == null) return false;
    return dateKeyInInclusiveRange(closedKey, startDate, endDate);
  }
  if (dateKeyInInclusiveRange(createdKey, startDate, endDate)) return true;
  if (closedKey != null && dateKeyInInclusiveRange(closedKey, startDate, endDate)) {
    return true;
  }
  return false;
}

/** Statuses shown on the board, in workflow order (`GET /api/statuses`). */
export function visibleStatusesForBoard(
  board: Board,
  workflowOrder: readonly string[] = [...DEFAULT_STATUS_IDS],
): string[] {
  const valid = new Set(workflowOrder);
  const vis = board.visibleStatuses.filter((s) => valid.has(s));
  if (vis.length > 0) {
    return workflowOrder.filter((s) => vis.includes(s));
  }
  return [...workflowOrder];
}

export function bandWeightsForBoard(
  board: Board,
  workflowOrder: readonly string[] = [...DEFAULT_STATUS_IDS],
): number[] {
  const vis = visibleStatusesForBoard(board, workflowOrder);
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

/** `null` = All priorities, `[]` = explicit empty filter, otherwise selected ids. */
export function taskMatchesPriorityFilter(
  task: Task,
  activePriorityIds: ActiveTaskPriorityIds | undefined,
): boolean {
  if (activePriorityIds == null) return true;
  if (activePriorityIds.length === 0) return false;
  return (
    task.priorityId != null &&
    activePriorityIds.includes(String(task.priorityId))
  );
}

/**
 * Tasks for a list in stacked view: filter by visible statuses and active group,
 * then sort by workflow order then band order.
 */
export function listTasksMergedSorted(
  board: Board,
  listId: number,
  visibleStatuses: string[],
  activeGroup: string,
  activePriorityIds: ActiveTaskPriorityIds,
  workflowOrder: readonly string[] = [...DEFAULT_STATUS_IDS],
  dateFilter: TaskDateFilterResolved | null = null,
): Task[] {
  const vis = new Set(visibleStatuses);
  let tasks = board.tasks.filter(
    (t) => t.listId === listId && vis.has(t.status),
  );
  if (activeGroup !== ALL_TASK_GROUPS) {
    tasks = tasks.filter((t) => String(t.groupId) === activeGroup);
  }
  tasks = tasks.filter((t) => taskMatchesPriorityFilter(t, activePriorityIds));
  if (dateFilter != null) {
    tasks = tasks.filter((t) => taskMatchesDateFilter(t, dateFilter));
  }
  return [...tasks].sort((a, b) => {
    const da = statusOrderIndex(a.status, workflowOrder);
    const db = statusOrderIndex(b.status, workflowOrder);
    if (da !== db) return da - db;
    return a.order - b.order;
  });
}
