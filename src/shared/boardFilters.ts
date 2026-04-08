import { DEFAULT_STATUS_IDS, type Board, type Task } from "./models";

export type ActiveTaskPriorityIds = string[] | null;

/** `null` = all groups; `[]` = explicit empty (no tasks); otherwise OR by id string. */
export type ActiveTaskGroupIds = string[] | null;

/**
 * Sentinel id in filter URL/store for tasks with no release (`releaseId` null).
 * Must not collide with numeric release id strings.
 */
export const RELEASE_FILTER_UNTAGGED = "__untagged__";

/** `null` = all releases; `[]` = explicit empty; otherwise OR across ids + optional untagged. */
export type ActiveReleaseIds = string[] | null;

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

/** `null` = All priorities, `[]` = explicit empty filter, otherwise selected ids. */
export function taskMatchesPriorityFilter(
  task: Task,
  activePriorityIds: ActiveTaskPriorityIds | undefined,
): boolean {
  if (activePriorityIds == null) return true;
  if (activePriorityIds.length === 0) return false;
  return activePriorityIds.includes(String(task.priorityId));
}

/** `null` = all groups, `[]` = no tasks, otherwise task must be in one of the listed ids. */
export function taskMatchesGroupFilter(
  task: Task,
  activeGroupIds: ActiveTaskGroupIds | undefined,
): boolean {
  if (activeGroupIds == null) return true;
  if (activeGroupIds.length === 0) return false;
  return activeGroupIds.includes(String(task.groupId));
}

/** `null` = all releases; `[]` = no tasks; OR across numeric ids and/or untagged bucket. */
export function taskMatchesReleaseFilter(
  task: Task,
  activeReleaseIds: ActiveReleaseIds | undefined,
): boolean {
  if (activeReleaseIds == null) return true;
  if (activeReleaseIds.length === 0) return false;
  const includeUntagged = activeReleaseIds.includes(RELEASE_FILTER_UNTAGGED);
  const idSet = new Set(
    activeReleaseIds.filter((id) => id !== RELEASE_FILTER_UNTAGGED),
  );
  const rid = task.releaseId ?? null;
  if (rid == null) return includeUntagged;
  return idSet.has(String(rid));
}

export interface BoardFilterGroupPriorityDate {
  activeGroupIds: ActiveTaskGroupIds;
  activePriorityIds: ActiveTaskPriorityIds;
  activeReleaseIds: ActiveReleaseIds;
  dateFilter: TaskDateFilterResolved | null;
}

// Keep board filtering in one shared place so rendering, keyboard nav, DnD,
// and server-side stats do not drift as new filter types get added.
export function taskMatchesBoardFilter(
  task: Task,
  filter: Pick<
    BoardFilterGroupPriorityDate,
    | "activeGroupIds"
    | "activePriorityIds"
    | "activeReleaseIds"
    | "dateFilter"
  >,
): boolean {
  const { activeGroupIds, activePriorityIds, activeReleaseIds, dateFilter } =
    filter;
  if (!taskMatchesGroupFilter(task, activeGroupIds)) {
    return false;
  }
  if (!taskMatchesPriorityFilter(task, activePriorityIds)) {
    return false;
  }
  if (!taskMatchesReleaseFilter(task, activeReleaseIds)) {
    return false;
  }
  if (dateFilter != null && !taskMatchesDateFilter(task, dateFilter)) {
    return false;
  }
  return true;
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
