import {
  type BoardColorPreset,
  parseBoardColor,
} from "./boardColor";

/** Fixed workflow statuses for every board (not customizable per board). */
export const TASK_STATUSES = ["open", "in-progress", "closed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** @deprecated Use TASK_STATUSES */
export const DEFAULT_STATUS_DEFINITIONS = TASK_STATUSES;

export interface GroupDefinition {
  id: string;
  label: string;
}

/** Default groups for new boards — numeric string ids for readable JSON. */
export function createDefaultTaskGroups(): GroupDefinition[] {
  return [
    { id: "0", label: "feature" },
    { id: "1", label: "bug" },
    { id: "2", label: "enhancement" },
  ];
}

/**
 * Next group id when adding a row in the UI: max numeric id + 1.
 * Non-numeric ids are ignored for the max (early-dev boards use 0,1,2,…).
 */
export function nextGroupId(groups: GroupDefinition[]): string {
  let max = -1;
  for (const g of groups) {
    const n = Number.parseInt(g.id, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

/** Resolved label for a group id, or the id if unknown. */
export function groupLabelForId(
  groups: GroupDefinition[],
  groupId: string,
): string {
  return groups.find((g) => g.id === groupId)?.label ?? groupId;
}

function parseTaskGroupsFromRaw(rawTaskGroups: unknown): GroupDefinition[] {
  if (!Array.isArray(rawTaskGroups) || rawTaskGroups.length === 0) {
    return createDefaultTaskGroups();
  }

  if (typeof rawTaskGroups[0] === "string") {
    return (rawTaskGroups as string[]).map((rawLabel, index) => ({
      id: String(index),
      label: String(rawLabel).trim() || "group",
    }));
  }

  const out: GroupDefinition[] = [];
  for (let index = 0; index < rawTaskGroups.length; index++) {
    const item = rawTaskGroups[index];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    if (!label) continue;
    const id =
      typeof rec.id === "string" && rec.id.length > 0
        ? rec.id
        : String(index);
    out.push({ id, label });
  }
  return out.length > 0 ? out : createDefaultTaskGroups();
}

/** Coerce arbitrary string to a valid workflow status (defaults to first). */
export function coerceTaskStatus(raw: string): TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(raw)
    ? (raw as TaskStatus)
    : TASK_STATUSES[0];
}

function resolveGroupId(raw: string, groups: GroupDefinition[]): string {
  if (groups.some((g) => g.id === raw)) return raw;
  return groups[0]!.id;
}

export interface List {
  id: string;
  name: string;
  order: number;
  color?: string;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  body: string;
  /** Stable group id from `board.taskGroups`. */
  group: string;
  status: TaskStatus;
  order: number;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

/** Row in `data/_index.json` — lightweight board list for the sidebar. */
export interface BoardIndexEntry {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

/** Board body layout: full-height status lanes vs merged stacked lists. */
export type BoardLayout = "lanes" | "stacked";

export interface Board {
  id: string;
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

/** Normalize a task from disk/API. */
export function normalizeTask(
  raw: Record<string, unknown>,
  fallbackGroup: string,
): Omit<Task, "status"> & { status: string } {
  const group =
    typeof raw.group === "string" && raw.group.length > 0
      ? raw.group
      : fallbackGroup;
  return {
    id: String(raw.id ?? ""),
    listId: String(raw.listId ?? ""),
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    group,
    status: typeof raw.status === "string" ? raw.status : "",
    order: typeof raw.order === "number" ? raw.order : 0,
    color: typeof raw.color === "string" ? raw.color : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

/** Normalize board JSON from disk/API into the current `Board` shape. */
export function normalizeBoardFromJson(raw: Record<string, unknown>): Board {
  const taskGroups = parseTaskGroupsFromRaw(raw.taskGroups);
  const fallbackGroupId = taskGroups[0]!.id;

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks: Task[] = tasksRaw.map((t) => {
    const nt = normalizeTask(t as Record<string, unknown>, fallbackGroupId);
    const status = coerceTaskStatus(nt.status);
    const group = resolveGroupId(nt.group, taskGroups);
    return {
      ...nt,
      status,
      group,
    };
  });

  const lists = Array.isArray(raw.lists) ? (raw.lists as Board["lists"]) : [];
  const visibleStatusesRaw = Array.isArray(raw.visibleStatuses)
    ? [...(raw.visibleStatuses as string[])]
    : [...TASK_STATUSES];
  const visibleStatuses = visibleStatusesRaw.filter((s) =>
    (TASK_STATUSES as readonly string[]).includes(s),
  );
  const visibleStatusesFinal =
    visibleStatuses.length > 0 ? visibleStatuses : [...TASK_STATUSES];

  const layoutRaw = raw.boardLayout;
  const boardLayout: BoardLayout | undefined =
    layoutRaw === "stacked" || layoutRaw === "lanes"
      ? layoutRaw
      : undefined;

  const boardColor = parseBoardColor(raw.boardColor);

  return {
    id: String(raw.id ?? ""),
    name: typeof raw.name === "string" ? raw.name : "",
    backgroundImage:
      typeof raw.backgroundImage === "string"
        ? raw.backgroundImage
        : undefined,
    boardColor,
    taskGroups,
    visibleStatuses: visibleStatusesFinal,
    statusBandWeights: Array.isArray(raw.statusBandWeights)
      ? [...(raw.statusBandWeights as number[])]
      : undefined,
    boardLayout,
    showCounts: Boolean(raw.showCounts),
    lists,
    tasks,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}
