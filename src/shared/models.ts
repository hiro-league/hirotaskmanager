/** Default task types for new boards (user-editable per board later). */
export const DEFAULT_TASK_TYPES = [
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

export type TaskType = (typeof DEFAULT_TASK_TYPES)[number];
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
  type: string;
  status: string;
  order: number;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

/** Row in `data/_index.json` — lightweight board list for the sidebar. */
export interface BoardIndexEntry {
  id: string;
  name: string;
  createdAt: string;
}

export interface Board {
  id: string;
  name: string;
  backgroundImage?: string;
  taskTypes: string[];
  statusDefinitions: string[];
  activeTaskType: string;
  visibleStatuses: string[];
  showCounts: boolean;
  lists: List[];
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}
