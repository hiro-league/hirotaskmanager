import type { TableColumn } from "../types/output";

/**
 * Default API keys for global `--quiet` on list reads (first present non-empty wins).
 * Boards prefer slug for shell ergonomics, then numeric id.
 */
export const QUIET_DEFAULT_BOARD_INDEX = ["slug", "boardId"] as const;
export const QUIET_DEFAULT_TASK = ["taskId"] as const;
export const QUIET_DEFAULT_RELEASE = ["releaseId"] as const;
export const QUIET_DEFAULT_STATUS = ["statusId"] as const;
export const QUIET_DEFAULT_TRASH_BOARD = ["slug", "boardId"] as const;
export const QUIET_DEFAULT_TRASH_LIST = ["listId"] as const;

/** `lists list` — same id default as trashed lists for scripts. */
export const QUIET_DEFAULT_LIST = ["listId"] as const;
export const QUIET_DEFAULT_TRASH_TASK = ["taskId"] as const;
export const QUIET_DEFAULT_SEARCH_HIT = ["taskId"] as const;

/** `boards list` */
export const COLUMNS_BOARDS_LIST: TableColumn[] = [
  { key: "boardId", header: "Id", width: 6 },
  { key: "slug", header: "Slug", width: 18 },
  { key: "name", header: "Name", width: 22 },
  { key: "emoji", header: "Em", width: 4 },
];

/** `boards describe` — board header row */
export const COLUMNS_DESCRIBE_BOARD: TableColumn[] = [
  { key: "boardId", header: "Id", width: 6 },
  { key: "slug", header: "Slug", width: 18 },
  { key: "name", header: "Name", width: 22 },
  { key: "emoji", header: "Em", width: 4 },
];

/** `boards describe` — lists slice */
export const COLUMNS_DESCRIBE_LIST: TableColumn[] = [
  { key: "listId", header: "List", width: 6 },
  { key: "name", header: "Name", width: 28 },
];

/** `boards describe` — groups slice (`def` = default group) */
export const COLUMNS_DESCRIBE_GROUP: TableColumn[] = [
  { key: "groupId", header: "Group", width: 6 },
  { key: "label", header: "Label", width: 18 },
  { key: "def", header: "Def", width: 4 },
];

/** `boards describe` — priorities slice */
export const COLUMNS_DESCRIBE_PRIORITY: TableColumn[] = [
  { key: "priorityId", header: "Id", width: 6 },
  { key: "label", header: "Label", width: 14 },
  { key: "value", header: "Value", width: 6 },
];

/** `boards describe` — releases slice */
export const COLUMNS_DESCRIBE_RELEASE: TableColumn[] = [
  { key: "releaseId", header: "Id", width: 6 },
  { key: "name", header: "Name", width: 18 },
  { key: "releaseDate", header: "Date", width: 12 },
  { key: "def", header: "Def", width: 4 },
];

/** `boards describe` — statuses slice */
export const COLUMNS_DESCRIBE_STATUS: TableColumn[] = [
  { key: "statusId", header: "StatusId", width: 14 },
  { key: "label", header: "Label", width: 22 },
];

/** `tasks list` */
export const COLUMNS_TASKS_LIST: TableColumn[] = [
  { key: "taskId", header: "Task", width: 6 },
  { key: "title", header: "Title", width: 28 },
  { key: "listId", header: "List", width: 6 },
  { key: "status", header: "Status", width: 12 },
  { key: "releaseId", header: "Rel", width: 5 },
];

/** `releases list` */
export const COLUMNS_RELEASES_LIST: TableColumn[] = [
  { key: "releaseId", header: "Id", width: 6 },
  { key: "name", header: "Name", width: 22 },
  { key: "releaseDate", header: "Date", width: 12 },
  { key: "color", header: "Color", width: 10 },
];

/** `lists list` — all list JSON keys from the API (human table may truncate wide cells). */
export const COLUMNS_LISTS_LIST: TableColumn[] = [
  { key: "listId", header: "List", width: 6 },
  { key: "name", header: "Name", width: 18 },
  { key: "order", header: "Ord", width: 5 },
  { key: "color", header: "Color", width: 10 },
  { key: "emoji", header: "Em", width: 4 },
  { key: "createdByPrincipal", header: "By", width: 5 },
  { key: "createdByLabel", header: "Creator", width: 14 },
];

/** `statuses list` */
export const COLUMNS_STATUSES_LIST: TableColumn[] = [
  { key: "statusId", header: "StatusId", width: 14 },
  { key: "label", header: "Label", width: 18 },
  { key: "sortOrder", header: "Ord", width: 5 },
  { key: "isClosed", header: "Closed", width: 6 },
];

/** `trash list boards` */
export const COLUMNS_TRASH_BOARDS: TableColumn[] = [
  { key: "boardId", header: "Id", width: 6 },
  { key: "name", header: "Name", width: 20 },
  { key: "slug", header: "Slug", width: 16 },
  { key: "deletedAt", header: "Deleted", width: 22 },
];

/** `trash list lists` */
export const COLUMNS_TRASH_LISTS: TableColumn[] = [
  { key: "listId", header: "List", width: 6 },
  { key: "name", header: "Name", width: 18 },
  { key: "boardId", header: "Board", width: 6 },
  { key: "deletedAt", header: "Deleted", width: 22 },
];

/** `trash list tasks` */
export const COLUMNS_TRASH_TASKS: TableColumn[] = [
  { key: "taskId", header: "Task", width: 6 },
  { key: "title", header: "Title", width: 22 },
  { key: "boardId", header: "Brd", width: 5 },
  { key: "listId", header: "Lst", width: 5 },
  { key: "deletedAt", header: "Deleted", width: 20 },
];

/** `query search` human-mode columns. */
export const COLUMNS_SEARCH_HITS: TableColumn[] = [
  { key: "boardSlug", header: "Board", width: 16 },
  { key: "taskId", header: "Id", width: 5 },
  { key: "title", header: "Title", width: 26 },
  { key: "snippet", header: "Snippet", width: 44 },
];
