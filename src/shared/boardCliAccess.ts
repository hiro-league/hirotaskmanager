/** Sent by hirotm on every API request so the server can enforce per-board CLI policy. */
export const TASK_MANAGER_CLIENT_HEADER = "X-TaskManager-Client";
export const TASK_MANAGER_CLIENT_HIROTM = "hirotm";

/** Optional human-friendly client label for notifications (e.g. Web App, Cursor Agent). */
export const TASK_MANAGER_CLIENT_NAME_HEADER = "X-TaskManager-Client-Name";

/** Optional per-session/client instance id for own-write filtering and toasts. */
export const TASK_MANAGER_CLIENT_INSTANCE_HEADER = "X-TaskManager-Client-Instance";

export const CLI_BOARD_ACCESS_DENIED_MESSAGE =
  "CLI access to this board is disabled. Ask the owner to enable CLI read access in Edit board (hirotm permissions).";

export const CLI_BOARD_READ_ONLY_MESSAGE =
  "This action is not allowed for the CLI on this board. Ask the owner to adjust permissions in Edit board.";
