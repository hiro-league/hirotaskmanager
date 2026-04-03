import type { Context } from "hono";
import type { BoardIndexEntry } from "../shared/models";
import {
  CLI_BOARD_ACCESS_DENIED_MESSAGE,
  CLI_BOARD_READ_ONLY_MESSAGE,
  TASK_MANAGER_CLIENT_HEADER,
  TASK_MANAGER_CLIENT_HIROTM,
} from "../shared/boardCliAccess";

export function isCliRequest(c: Context): boolean {
  const v =
    c.req.header(TASK_MANAGER_CLIENT_HEADER) ??
    c.req.header("x-task-manager-client");
  return v?.toLowerCase() === TASK_MANAGER_CLIENT_HIROTM;
}

/** Returns a 403 JSON response when the hirotm CLI is not allowed; otherwise undefined. */
export function cliBoardAccessError(
  c: Context,
  entry: BoardIndexEntry,
  kind: "read" | "write",
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  const a = entry.cliAccess;
  if (kind === "read") {
    if (a === "read" || a === "read_write") return undefined;
    return c.json({ error: CLI_BOARD_ACCESS_DENIED_MESSAGE }, 403);
  }
  if (a === "read_write") return undefined;
  if (a === "read") {
    return c.json({ error: CLI_BOARD_READ_ONLY_MESSAGE }, 403);
  }
  return c.json({ error: CLI_BOARD_ACCESS_DENIED_MESSAGE }, 403);
}
