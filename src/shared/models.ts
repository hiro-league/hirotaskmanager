/** Default task groups for new boards (editable per board in the UI). */
export const DEFAULT_TASK_GROUPS = [
  "feature",
  "bug",
  "enhancement",
] as const;

/** Default status workflow for new boards. */
export const DEFAULT_STATUS_DEFINITIONS = [
  "open",
  "in-progress",
  "closed",
] as const;

export type TaskGroup = (typeof DEFAULT_TASK_GROUPS)[number];
export type TaskStatus = (typeof DEFAULT_STATUS_DEFINITIONS)[number];

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
  /** Task group id (string from board.taskGroups). */
  group: string;
  status: string;
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

export interface Board {
  id: string;
  name: string;
  backgroundImage?: string;
  /** User-defined group names for this board. */
  taskGroups: string[];
  statusDefinitions: string[];
  visibleStatuses: string[];
  /** Flex weights for each visible status band (same length / order as rendered visible statuses). */
  statusBandWeights?: number[];
  showCounts: boolean;
  lists: List[];
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

/** Persisted client preference: show tasks from every group. */
export const ALL_TASK_GROUPS = "__all__" as const;

/** Normalize a task from disk/API (supports legacy `type` field). */
export function normalizeTask(
  raw: Record<string, unknown>,
  fallbackGroup: string,
): Task {
  const group =
    typeof raw.group === "string" && raw.group.length > 0
      ? raw.group
      : typeof raw.type === "string" && raw.type.length > 0
        ? raw.type
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

/** Normalize board JSON (supports legacy `taskTypes` / `activeTaskType`). */
export function normalizeBoardFromJson(raw: Record<string, unknown>): Board {
  const taskGroups = Array.isArray(raw.taskGroups)
    ? [...(raw.taskGroups as string[])]
    : Array.isArray(raw.taskTypes)
      ? [...(raw.taskTypes as string[])]
      : [...DEFAULT_TASK_GROUPS];

  const fallbackGroup = taskGroups[0] ?? "task";

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks = tasksRaw.map((t) =>
    normalizeTask(t as Record<string, unknown>, fallbackGroup),
  );

  const lists = Array.isArray(raw.lists) ? (raw.lists as Board["lists"]) : [];
  const statusDefinitions = Array.isArray(raw.statusDefinitions)
    ? [...(raw.statusDefinitions as string[])]
    : [...DEFAULT_STATUS_DEFINITIONS];
  const visibleStatuses = Array.isArray(raw.visibleStatuses)
    ? [...(raw.visibleStatuses as string[])]
    : [...statusDefinitions];

  return {
    id: String(raw.id ?? ""),
    name: typeof raw.name === "string" ? raw.name : "",
    backgroundImage:
      typeof raw.backgroundImage === "string"
        ? raw.backgroundImage
        : undefined,
    taskGroups,
    statusDefinitions,
    visibleStatuses,
    statusBandWeights: Array.isArray(raw.statusBandWeights)
      ? [...(raw.statusBandWeights as number[])]
      : undefined,
    showCounts: Boolean(raw.showCounts),
    lists,
    tasks,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}
