import type { UniqueIdentifier } from "@dnd-kit/abstract";

const LIST_PREFIX = "list-";
const TASK_PREFIX = "task-";
const STACKED_LIST_PREFIX = "stacked-list-";

export function sortableListId(listId: number): string {
  return `${LIST_PREFIX}${listId}`;
}

export function parseListSortableId(id: UniqueIdentifier): number | null {
  const s = String(id);
  if (!s.startsWith(LIST_PREFIX)) return null;
  const n = Number(s.slice(LIST_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

export function sortableTaskId(taskId: number): string {
  return `${TASK_PREFIX}${taskId}`;
}

export function parseTaskSortableId(id: UniqueIdentifier): number | null {
  const s = String(id);
  if (!s.startsWith(TASK_PREFIX)) return null;
  const n = Number(s.slice(TASK_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

export function stackedListContainerId(listId: number): string {
  return `${STACKED_LIST_PREFIX}${listId}`;
}

export function parseStackedListContainerId(id: string): number | null {
  if (!id.startsWith(STACKED_LIST_PREFIX)) return null;
  const n = Number(id.slice(STACKED_LIST_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

const LANE_BAND_PREFIX = "lane-band-";

/** Container id for a (list, status) band in lanes layout. */
export function laneBandContainerId(listId: number, status: string): string {
  return `${LANE_BAND_PREFIX}${listId}:${status}`;
}

export function parseLaneBandContainerId(
  id: string,
): { listId: number; status: string } | null {
  if (!id.startsWith(LANE_BAND_PREFIX)) return null;
  const rest = id.slice(LANE_BAND_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const listId = Number(rest.slice(0, sep));
  const status = rest.slice(sep + 1);
  if (!Number.isFinite(listId) || !status) return null;
  return { listId, status };
}

