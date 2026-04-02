import type { BoardColorPreset } from "./boardColor";

/** Workflow status row from `GET /api/statuses` / `status` table. */
export interface Status {
  id: string;
  label: string;
  sortOrder: number;
  isClosed: boolean;
}

/** Default workflow order when the API has not loaded yet (matches seeded `status` rows). */
export const DEFAULT_STATUS_IDS = ["open", "in-progress", "closed"] as const;

/** Task `status` is a `status.id` string (validated server-side against the DB). */
export type TaskStatus = string;

export interface GroupDefinition {
  id: number;
  label: string;
}

export interface TaskPriorityDefinition {
  id: number;
  value: number;
  label: string;
  color: string;
  isSystem: boolean;
}

/** Sort by `sortOrder`, then `id`. */
export function statusIdsInWorkflowOrder(statuses: Status[]): string[] {
  return [...statuses]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.id.localeCompare(b.id, "en"),
    )
    .map((s) => s.id);
}

/** Default groups for new boards — placeholder ids remapped by the server on save. */
export function createDefaultTaskGroups(): GroupDefinition[] {
  return [
    { id: 0, label: "feature" },
    { id: 1, label: "bug" },
    { id: 2, label: "enhancement" },
  ];
}

/**
 * Next group id when adding a row in the UI: max id + 1.
 */
export function nextGroupId(groups: GroupDefinition[]): number {
  let max = -1;
  for (const g of groups) {
    if (typeof g.id === "number" && g.id > max) max = g.id;
  }
  return max + 1;
}

/** Resolved label for a group id, or the id if unknown. */
export function groupLabelForId(
  groups: GroupDefinition[],
  groupId: number,
): string {
  return groups.find((g) => g.id === groupId)?.label ?? String(groupId);
}

/** Default priorities for new boards; placeholder ids are only for optimistic client state. */
export function createDefaultTaskPriorities(): TaskPriorityDefinition[] {
  return [
    { id: 10, value: 10, label: "low", color: "#94a3b8", isSystem: true },
    { id: 20, value: 20, label: "medium", color: "#3b82f6", isSystem: true },
    { id: 30, value: 30, label: "high", color: "#f97316", isSystem: true },
    { id: 40, value: 40, label: "critical", color: "#ef4444", isSystem: true },
  ];
}

/** Sort by numeric priority value, then stable id order. */
export function sortPrioritiesByValue(
  priorities: TaskPriorityDefinition[],
): TaskPriorityDefinition[] {
  return [...priorities].sort((a, b) => a.value - b.value || a.id - b.id);
}

/** Resolved label for a priority id, or empty string if the task is unassigned. */
export function priorityLabelForId(
  priorities: TaskPriorityDefinition[],
  priorityId?: number | null,
): string {
  if (priorityId == null) return "";
  return priorities.find((p) => p.id === priorityId)?.label ?? "";
}

/** Card/filter display label for priorities: keep the original name, just ensure a leading capital. */
export function priorityDisplayLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  return trimmed[0]!.toUpperCase() + trimmed.slice(1);
}

/** Coerce to a valid status id; defaults to the first entry in `allowedIds`. Used server-side. */
export function coerceTaskStatus(
  raw: string,
  allowedIds: readonly string[] = [...DEFAULT_STATUS_IDS],
): string {
  return allowedIds.includes(raw) ? raw : (allowedIds[0] ?? "open");
}

export interface List {
  id: number;
  name: string;
  order: number;
  color?: string;
}

export interface Task {
  id: number;
  listId: number;
  title: string;
  body: string;
  /** References `task_group.id` for this board. */
  groupId: number;
  /** Nullable reference to `task_priority.id` for this board. */
  priorityId?: number | null;
  status: TaskStatus;
  order: number;
  color?: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the task is in a closed (`is_closed`) status; first close time is preserved. */
  closedAt?: string | null;
}

/** Row in the board list API — lightweight sidebar entries. */
export interface BoardIndexEntry {
  id: number;
  slug: string;
  name: string;
  createdAt: string;
}

/** One hit from `GET /api/search` (FTS5 over task text, list, group, status labels). */
export interface SearchHit {
  taskId: number;
  boardId: number;
  boardSlug: string;
  boardName: string;
  /** List column name for this task (`list.name`). */
  listName: string;
  title: string;
  /** Excerpts around matches in indexed fields, joined with ` — ` (`«…»` mark spans). */
  snippet: string;
  /** bm25 score; lower values indicate a better match. */
  score: number;
}

/** Board body layout: full-height status lanes vs merged stacked lists. */
export type BoardLayout = "lanes" | "stacked";

export interface Board {
  id: number;
  /** URL slug (also in index); optional on partial client payloads. */
  slug?: string;
  name: string;
  backgroundImage?: string;
  /** Canvas color preset for the main column area; omitted reads as default (cyan) in UI. */
  boardColor?: BoardColorPreset;
  /** User-defined groups (id + label) for this board. */
  taskGroups: GroupDefinition[];
  /** Board-local task priorities, sorted by numeric value. */
  taskPriorities: TaskPriorityDefinition[];
  visibleStatuses: string[];
  /** Flex weights for each visible status band (same length / order as rendered visible statuses). */
  statusBandWeights?: number[];
  /** How lists are laid out in the board body. Defaults to stacked when omitted; use `"lanes"` for status bands. */
  boardLayout?: BoardLayout;
  showCounts: boolean;
  lists: List[];
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

/** Effective layout: only explicit `"lanes"` selects lanes; omitted or `"stacked"` → stacked. */
export function resolvedBoardLayout(board: Board): BoardLayout {
  return board.boardLayout === "lanes" ? "lanes" : "stacked";
}

/** Persisted client preference: show tasks from every group. */
export const ALL_TASK_GROUPS = "__all__" as const;
