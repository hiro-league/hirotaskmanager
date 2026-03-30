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
