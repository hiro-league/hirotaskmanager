import type { BoardColorPreset } from "./boardColor";
import type { BoardCliPolicy } from "./cliPolicy";
import type { CreatorPrincipalType } from "./provenance";

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
  /** Display order within the board; persisted on the server. */
  sortOrder: number;
  /** Optional emoji before the label; not used for search or sorting. */
  emoji?: string | null;
}

export interface TaskPriorityDefinition {
  id: number;
  value: number;
  label: string;
  color: string;
  isSystem: boolean;
}

/** Board-scoped release label (`board_release`); tasks may reference at most one per board. */
export interface ReleaseDefinition {
  id: number;
  name: string;
  /** Same palette conventions as task priorities; omitted when unset. */
  color?: string | null;
  /** Optional calendar/metadata date (`YYYY-MM-DD` or ISO string). */
  releaseDate?: string | null;
  createdAt: string;
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
    { id: 0, label: "feature", sortOrder: 0 },
    { id: 1, label: "bug", sortOrder: 1 },
    { id: 2, label: "enhancement", sortOrder: 2 },
  ];
}

/**
 * Task groups in persisted display order (`sort_order`, then `id`).
 * Phase 4: UI and shortcuts use this so behavior matches explicit `sort_order`, not accidental cache array order.
 */
export function sortTaskGroupsForDisplay(
  groups: readonly GroupDefinition[],
): GroupDefinition[] {
  return [...groups].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  );
}

const groupIds = (groups: readonly GroupDefinition[]): Set<number> =>
  new Set(groups.map((g) => g.id));

/**
 * Default `groupId` for new tasks when no stricter context (e.g. active filter) applies.
 * Phase 4: prefers persisted `defaultTaskGroupId` when valid; else first group in display order (not raw array index).
 */
export function effectiveDefaultTaskGroupId(board: {
  taskGroups: GroupDefinition[];
  defaultTaskGroupId: number;
}): number {
  const ids = groupIds(board.taskGroups);
  if (ids.has(board.defaultTaskGroupId)) {
    return board.defaultTaskGroupId;
  }
  const ordered = sortTaskGroupsForDisplay(board.taskGroups);
  return ordered[0]?.id ?? 0;
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

/** Plain text label for a group id, or the id if unknown (no emoji). */
export function groupLabelForId(
  groups: GroupDefinition[],
  groupId: number,
): string {
  return groups.find((g) => g.id === groupId)?.label ?? String(groupId);
}

/** Visible group label: optional emoji, space, then name (Phase 1 task group icons). */
export function formatGroupDisplayLabel(g: GroupDefinition): string {
  const label = g.label.trim() || String(g.id);
  const e = g.emoji?.trim();
  return e ? `${e} ${label}` : label;
}

/** Resolved display label for a group id (emoji + label when set). */
export function groupDisplayLabelForId(
  groups: GroupDefinition[],
  groupId: number,
): string {
  const g = groups.find((x) => x.id === groupId);
  if (!g) return String(groupId);
  return formatGroupDisplayLabel(g);
}

/** Built-in numeric slot for the default "no level" priority (`task_priority.value`). */
export const NONE_TASK_PRIORITY_VALUE = 0;

/** Default priorities for new boards; placeholder ids are only for optimistic client state. */
export function createDefaultTaskPriorities(): TaskPriorityDefinition[] {
  return [
    { id: 5, value: 0, label: "none", color: "#ffffff", isSystem: true },
    { id: 10, value: 10, label: "low", color: "#94a3b8", isSystem: true },
    { id: 20, value: 20, label: "medium", color: "#3b82f6", isSystem: true },
    { id: 30, value: 30, label: "high", color: "#f97316", isSystem: true },
    { id: 40, value: 40, label: "critical", color: "#ef4444", isSystem: true },
  ];
}

/** Resolve the persisted row id for the builtin `none` priority (`value` = {@link NONE_TASK_PRIORITY_VALUE}), if present. */
export function noneTaskPriorityId(
  priorities: readonly TaskPriorityDefinition[],
): number | undefined {
  return priorities.find((p) => p.value === NONE_TASK_PRIORITY_VALUE)?.id;
}

/** Sort by numeric priority value, then stable id order. */
export function sortPrioritiesByValue(
  priorities: TaskPriorityDefinition[],
): TaskPriorityDefinition[] {
  return [...priorities].sort((a, b) => a.value - b.value || a.id - b.id);
}

/** Resolved label for a priority id, or empty string if unknown. */
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
  /** Optional emoji before the list name; not indexed for search. */
  emoji?: string | null;
  /** Who created this list (`web` vs `cli`); optional on older payloads. */
  createdByPrincipal?: CreatorPrincipalType;
  createdByLabel?: string | null;
}

/** Visible list name: emoji + space + name when emoji is set. */
export function listDisplayName(list: List): string {
  const base = list.name.trim() || String(list.id);
  const e = list.emoji?.trim();
  return e ? `${e} ${base}` : base;
}

export interface Task {
  id: number;
  listId: number;
  title: string;
  body: string;
  /** References `task_group.id` for this board. */
  groupId: number;
  /** References `task_priority.id` for this board (always set; builtin `none` is the default). */
  priorityId: number;
  status: TaskStatus;
  order: number;
  color?: string;
  /** Optional emoji before the title; not indexed for search. */
  emoji?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the task is in a closed (`is_closed`) status; first close time is preserved. */
  closedAt?: string | null;
  /** Who created this task (`web` vs `cli`); optional on older payloads. */
  createdByPrincipal?: CreatorPrincipalType;
  createdByLabel?: string | null;
  /** References `board_release.id`; null = untagged. */
  releaseId?: number | null;
}

/** Visible task title line: emoji + space + title when emoji is set. */
export function taskDisplayTitle(task: Task): string {
  const base = task.title.trim() || "Untitled";
  const e = task.emoji?.trim();
  return e ? `${e} ${base}` : base;
}

/** Row in the board list API — lightweight sidebar entries. */
export interface BoardIndexEntry {
  id: number;
  slug: string;
  name: string;
  /** Optional emoji before the board name; not indexed for search. */
  emoji?: string | null;
  /** Plain-text notes; empty string when unset (same as full `Board`). */
  description: string;
  /** Granular hirotm CLI permissions (`board_cli_policy`). */
  cliPolicy: BoardCliPolicy;
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
  /** Optional emoji before the board name; not indexed for search. */
  emoji?: string | null;
  /** Plain-text notes for humans; not indexed for search yet. */
  description?: string;
  /** Granular hirotm CLI permissions (`board_cli_policy`). */
  cliPolicy: BoardCliPolicy;
  backgroundImage?: string;
  /** Canvas color preset for the main column area; omitted reads as default (cyan) in UI. */
  boardColor?: BoardColorPreset;
  /** User-defined groups (id + label) for this board. */
  taskGroups: GroupDefinition[];
  /** Default `task_group.id` for new tasks when no stricter context applies. */
  defaultTaskGroupId: number;
  /** Default destination group when tasks must move off a removed group. */
  deletedGroupFallbackId: number;
  /** Board-local task priorities, sorted by numeric value. */
  taskPriorities: TaskPriorityDefinition[];
  /** Board-scoped releases; display order by `createdAt`. */
  releases: ReleaseDefinition[];
  /** Optional default release for keyboard shortcut `e` and auto-assign (when enabled). */
  defaultReleaseId: number | null;
  /** When set with `defaultReleaseId`, new web-created tasks get that release if `releaseId` is omitted on create. */
  autoAssignReleaseOnCreateUi: boolean;
  /** When set with `defaultReleaseId`, new CLI-created tasks get that release if `releaseId` is omitted on create. */
  autoAssignReleaseOnCreateCli: boolean;
  visibleStatuses: string[];
  /** Flex weights for each visible status band (same length / order as rendered visible statuses). */
  statusBandWeights?: number[];
  /** How lists are laid out in the board body. Defaults to stacked when omitted; use `"lanes"` for status bands. */
  boardLayout?: BoardLayout;
  /** When true, board and list T/O/C chips are shown (persisted in `board_view_prefs.show_counts`). */
  showStats: boolean;
  /** When true, task-completion celebration sounds are not played (persisted in `board_view_prefs.celebration_sounds_muted`). */
  muteCelebrationSounds: boolean;
  lists: List[];
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
  /** Who created this board (`web` vs `cli`); optional on older payloads. */
  createdByPrincipal?: CreatorPrincipalType;
  createdByLabel?: string | null;
}

/** Visible board title line: emoji + space + name when emoji is set. */
export function boardDisplayName(board: Pick<Board, "name" | "emoji">): string {
  const base = board.name.trim() || "Untitled";
  const e = board.emoji?.trim();
  return e ? `${e} ${base}` : base;
}

/** Effective layout: only explicit `"lanes"` selects lanes; omitted or `"stacked"` → stacked. */
export function resolvedBoardLayout(board: Board): BoardLayout {
  return board.boardLayout === "lanes" ? "lanes" : "stacked";
}

/** Persisted client preference: show tasks from every group. */
export const ALL_TASK_GROUPS = "__all__" as const;
