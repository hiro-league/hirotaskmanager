import { statusIdsInWorkflowOrder, type Board, type Status, type Task } from "./models";
import {
  isValidYmd,
  taskMatchesBoardFilter,
  type ActiveReleaseIds,
  type ActiveTaskGroupIds,
  type TaskDateFilterResolved,
} from "./boardFilters";
import { repeatedSearchParamValues } from "./repeatedSearchParams";

/**
 * Normalized filter for stats API and server aggregation.
 * Status visibility toggles are intentionally excluded: T/O/C already partition by open vs closed.
 */
export interface BoardStatsFilter {
  /** `null` = all groups; `[]` = no tasks; otherwise OR by task group id string. */
  activeGroupIds: ActiveTaskGroupIds;
  activePriorityIds: string[] | null;
  /** `null` = all releases; `[]` = no tasks; OR across release ids + untagged sentinel. */
  activeReleaseIds: ActiveReleaseIds;
  dateFilter: TaskDateFilterResolved | null;
}

export interface TaskCountStat {
  total: number;
  open: number;
  closed: number;
  calculating?: boolean;
}

export interface BoardStatsResponse {
  boardId: number;
  board: TaskCountStat;
  lists: Array<{
    listId: number;
    stats: TaskCountStat;
  }>;
}

const emptyStat = (): TaskCountStat => ({ total: 0, open: 0, closed: 0 });

function taskMatchesStatsScope(task: Task, filter: BoardStatsFilter): boolean {
  return taskMatchesBoardFilter(task, {
    activeGroupIds: filter.activeGroupIds,
    activePriorityIds: filter.activePriorityIds,
    activeReleaseIds: filter.activeReleaseIds,
    dateFilter: filter.dateFilter,
  });
}

/**
 * Single-pass board + per-list T/O/C for tasks matching `filter`.
 * `closedStatusIds` must contain every status id whose workflow row has `isClosed`.
 */
export function computeBoardStats(
  board: Board,
  closedStatusIds: ReadonlySet<string>,
  filter: BoardStatsFilter,
): BoardStatsResponse {
  const boardStat = emptyStat();
  const listStats = new Map<number, TaskCountStat>();
  const listIds = new Set(board.lists.map((l) => l.id));
  for (const list of board.lists) {
    listStats.set(list.id, emptyStat());
  }

  for (const task of board.tasks) {
    if (!taskMatchesStatsScope(task, filter)) continue;
    const isClosed = closedStatusIds.has(task.status);
    boardStat.total += 1;
    if (isClosed) boardStat.closed += 1;
    else boardStat.open += 1;

    if (listIds.has(task.listId)) {
      const ls = listStats.get(task.listId);
      if (ls) {
        ls.total += 1;
        if (isClosed) ls.closed += 1;
        else ls.open += 1;
      }
    }
  }

  const lists = board.lists.map((list) => ({
    listId: list.id,
    stats: listStats.get(list.id) ?? emptyStat(),
  }));

  return {
    boardId: board.id,
    board: boardStat,
    lists,
  };
}

/** Build closed-status id set from workflow rows (canonical `isClosed` semantics). */
export function closedStatusIdsFromStatuses(statuses: Status[]): Set<string> {
  return new Set(statuses.filter((s) => s.isClosed).map((s) => s.id));
}

/**
 * Parse GET /api/boards/:id/stats query params into a normalized filter.
 * Uses repeated `groupId` (and comma-separated fragments) like `GET /api/boards/:id/tasks`.
 * (`visibleStatuses` is ignored if present — stats do not scope by status visibility.)
 */
export function parseBoardStatsFilter(
  searchParams: URLSearchParams,
): BoardStatsFilter {
  // Absent `groupId` = all groups (like tasks API). Present but empty = explicit no-match, distinct from omission.
  const hasGroupKey = searchParams.has("groupId");
  const groupParts = repeatedSearchParamValues(searchParams, "groupId");
  let activeGroupIds: ActiveTaskGroupIds;
  if (!hasGroupKey) {
    activeGroupIds = null;
  } else if (groupParts.length === 0) {
    activeGroupIds = [];
  } else {
    activeGroupIds = groupParts;
  }

  const priRaw = searchParams.get("priorityIds");
  let activePriorityIds: string[] | null;
  if (priRaw === null) {
    activePriorityIds = null;
  } else if (priRaw.trim() === "") {
    activePriorityIds = [];
  } else {
    activePriorityIds = priRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const hasReleaseKey = searchParams.has("releaseId");
  const releaseParts = repeatedSearchParamValues(searchParams, "releaseId");
  let activeReleaseIds: ActiveReleaseIds;
  if (!hasReleaseKey) {
    activeReleaseIds = null;
  } else if (releaseParts.length === 0) {
    activeReleaseIds = [];
  } else {
    activeReleaseIds = releaseParts;
  }

  const dateMode = searchParams.get("dateMode");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  let dateFilter: TaskDateFilterResolved | null = null;
  if (
    dateMode !== null &&
    startDate !== null &&
    endDate !== null &&
    (dateMode === "opened" || dateMode === "closed" || dateMode === "any") &&
    isValidYmd(startDate) &&
    isValidYmd(endDate)
  ) {
    dateFilter = {
      mode: dateMode,
      startDate,
      endDate,
    };
  }

  return {
    activeGroupIds,
    activePriorityIds,
    activeReleaseIds,
    dateFilter,
  };
}

/** Workflow order for stats parsing; same as client board ordering. */
export function workflowOrderFromStatuses(statuses: Status[]): string[] {
  return statusIdsInWorkflowOrder(statuses);
}

/**
 * Serialize a normalized filter for `GET /api/boards/:id/stats` (inverse of {@link parseBoardStatsFilter}).
 */
export function buildBoardStatsSearchParams(
  filter: BoardStatsFilter,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (filter.activeGroupIds === null) {
    // omit — all groups
  } else if (filter.activeGroupIds.length === 0) {
    sp.append("groupId", "");
  } else {
    for (const id of filter.activeGroupIds) {
      sp.append("groupId", id);
    }
  }
  if (filter.activePriorityIds === null) {
    // omit — server treats as "all priorities"
  } else if (filter.activePriorityIds.length === 0) {
    sp.set("priorityIds", "");
  } else {
    sp.set("priorityIds", filter.activePriorityIds.join(","));
  }
  if (filter.activeReleaseIds === null) {
    // omit — all releases
  } else if (filter.activeReleaseIds.length === 0) {
    sp.append("releaseId", "");
  } else {
    for (const id of filter.activeReleaseIds) {
      sp.append("releaseId", id);
    }
  }
  if (filter.dateFilter != null) {
    sp.set("dateMode", filter.dateFilter.mode);
    sp.set("startDate", filter.dateFilter.startDate);
    sp.set("endDate", filter.dateFilter.endDate);
  }
  return sp;
}

/** Stable string for TanStack Query keys (order-independent where sets are equivalent). */
export function boardStatsFilterSignature(filter: BoardStatsFilter): string {
  const grp =
    filter.activeGroupIds === null
      ? "null"
      : [...filter.activeGroupIds].sort().join(",");
  const pri =
    filter.activePriorityIds === null
      ? "null"
      : [...filter.activePriorityIds].sort().join(",");
  const rel =
    filter.activeReleaseIds === null
      ? "null"
      : [...filter.activeReleaseIds].sort().join(",");
  const df = filter.dateFilter
    ? `${filter.dateFilter.mode}|${filter.dateFilter.startDate}|${filter.dateFilter.endDate}`
    : "";
  return `${grp}|${pri}|${rel}|${df}`;
}
