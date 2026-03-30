import {
  type BoardColorPreset,
  parseBoardColor,
} from "./boardColor";

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

function parseId(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** When `taskGroups` is omitted (e.g. partial JSON), use defaults; when API sends `[]`, keep empty. */
function parseTaskGroupsFromRaw(rawTaskGroups: unknown): GroupDefinition[] {
  if (rawTaskGroups === undefined || rawTaskGroups === null) {
    return createDefaultTaskGroups();
  }
  if (!Array.isArray(rawTaskGroups)) {
    return createDefaultTaskGroups();
  }
  if (rawTaskGroups.length === 0) {
    return [];
  }

  if (typeof rawTaskGroups[0] === "string") {
    return (rawTaskGroups as string[]).map((rawLabel, index) => ({
      id: index,
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
      rec.id !== undefined && rec.id !== null
        ? parseId(rec.id)
        : index;
    out.push({ id, label });
  }
  return out.length > 0 ? out : createDefaultTaskGroups();
}

/** Coerce to a valid status id; defaults to the first entry in `allowedIds`. */
export function coerceTaskStatus(
  raw: string,
  allowedIds: readonly string[] = [...DEFAULT_STATUS_IDS],
): string {
  return allowedIds.includes(raw) ? raw : (allowedIds[0] ?? "open");
}

function resolveGroupId(raw: number, groups: GroupDefinition[]): number {
  if (groups.length === 0) return raw;
  if (groups.some((g) => g.id === raw)) return raw;
  return groups[0]!.id;
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

/** Normalize a task from disk/API. */
export function normalizeTask(
  raw: Record<string, unknown>,
  fallbackGroupId: number,
): Omit<Task, "status"> & { status: string } {
  const groupRaw = raw.groupId ?? raw.group;
  const groupId =
    typeof groupRaw === "number"
      ? groupRaw
      : parseId(groupRaw) || fallbackGroupId;
  return {
    id: parseId(raw.id),
    listId: parseId(raw.listId),
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    groupId,
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
  const fallbackGroupId = taskGroups[0]?.id ?? 0;

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks: Task[] = tasksRaw.map((t) => {
    const nt = normalizeTask(t as Record<string, unknown>, fallbackGroupId);
    const status = coerceTaskStatus(nt.status);
    const groupId = resolveGroupId(nt.groupId, taskGroups);
    return {
      ...nt,
      status,
      groupId,
    };
  });

  const listsRaw = Array.isArray(raw.lists) ? raw.lists : [];
  const lists: List[] = listsRaw.map((l) => {
    const rec = l as Record<string, unknown>;
    return {
      id: parseId(rec.id),
      name: typeof rec.name === "string" ? rec.name : "",
      order: typeof rec.order === "number" ? rec.order : 0,
      color: typeof rec.color === "string" ? rec.color : undefined,
    };
  });

  const allowed = DEFAULT_STATUS_IDS as readonly string[];
  const visibleStatusesRaw = Array.isArray(raw.visibleStatuses)
    ? [...(raw.visibleStatuses as string[])]
    : [...allowed];
  const visibleStatuses = visibleStatusesRaw.filter((s) => allowed.includes(s));
  const visibleStatusesFinal =
    visibleStatuses.length > 0 ? visibleStatuses : [...allowed];

  const layoutRaw = raw.boardLayout;
  const boardLayout: BoardLayout | undefined =
    layoutRaw === "stacked" || layoutRaw === "lanes"
      ? layoutRaw
      : undefined;

  const boardColor = parseBoardColor(raw.boardColor);

  return {
    id: parseId(raw.id),
    slug: typeof raw.slug === "string" ? raw.slug : undefined,
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
