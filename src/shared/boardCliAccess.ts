/** How the HTTP API treats requests that identify as the hirotm CLI (`X-TaskManager-Client: hirotm`). */
export const BOARD_CLI_ACCESS = ["none", "read", "read_write"] as const;
export type BoardCliAccess = (typeof BOARD_CLI_ACCESS)[number];

/** Sent by hirotm on every API request so the server can enforce per-board CLI policy. */
export const TASK_MANAGER_CLIENT_HEADER = "X-TaskManager-Client";
export const TASK_MANAGER_CLIENT_HIROTM = "hirotm";

/** Optional human-friendly client label for notifications (e.g. Web App, Cursor Agent). */
export const TASK_MANAGER_CLIENT_NAME_HEADER = "X-TaskManager-Client-Name";

/** Optional per-session/client instance id for own-write filtering and toasts. */
export const TASK_MANAGER_CLIENT_INSTANCE_HEADER = "X-TaskManager-Client-Instance";

export const CLI_BOARD_ACCESS_DENIED_MESSAGE =
  "CLI access to this board is disabled. Ask the owner to open Board settings in the web app and set CLI access to Read or Read/Write.";

export const CLI_BOARD_READ_ONLY_MESSAGE =
  "This board is read-only for the CLI. Ask the owner to set CLI access to Read/Write in Board settings in the web app.";

export function parseBoardCliAccess(raw: unknown): BoardCliAccess | null {
  if (raw === "none" || raw === "read" || raw === "read_write") return raw;
  return null;
}

export function normalizeBoardCliAccessColumn(
  raw: string | null | undefined,
): BoardCliAccess {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (t === "read" || t === "read_write") return t;
  return "none";
}
