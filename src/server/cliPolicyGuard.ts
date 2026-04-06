import type { Context } from "hono";
import type { BoardIndexEntry } from "../shared/models";
import type { BoardCliPolicy } from "../shared/cliPolicy";
import { EMPTY_BOARD_CLI_POLICY } from "../shared/cliPolicy";
import type { List, Task } from "../shared/models";
import type { AppBindings } from "./auth";
import { getRequestAuthContext } from "./auth";
import { readBoardCliPolicy, readCliGlobalPolicy } from "./storage/cliPolicy";

export function isCliRequest(c: Context<AppBindings>): boolean {
  return getRequestAuthContext(c).principal === "cli";
}

function policyForBoard(boardId: number): BoardCliPolicy {
  return readBoardCliPolicy(boardId) ?? EMPTY_BOARD_CLI_POLICY;
}

const MSG_READ = "CLI access to this board is disabled. Ask the owner to enable CLI read access in Board settings.";
const MSG_WRITE = "This action is not allowed for the CLI on this board. Ask the owner to adjust CLI permissions in Board settings.";
const MSG_CREATE_BOARD =
  "CLI board creation is disabled. Ask the owner to enable it in TaskManager CLI settings (web app).";

/** Web principal always passes. CLI requires `read_board`. */
export function cliBoardReadError(
  c: Context<AppBindings>,
  entry: BoardIndexEntry,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (policyForBoard(entry.id).readBoard) return undefined;
  return c.json({ error: MSG_READ }, 403);
}

/** Replaces legacy coarse write check — use granular helpers below for new code paths. */
export function cliBoardAccessError(
  c: Context<AppBindings>,
  entry: BoardIndexEntry,
  kind: "read" | "write",
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  const p = policyForBoard(entry.id);
  if (kind === "read") {
    if (p.readBoard) return undefined;
    return c.json({ error: MSG_READ }, 403);
  }
  const anyWrite =
    p.createTasks ||
    p.manageCliCreatedTasks ||
    p.manageAnyTasks ||
    p.createLists ||
    p.manageCliCreatedLists ||
    p.manageAnyLists ||
    p.manageStructure ||
    p.deleteBoard ||
    p.editBoard;
  if (anyWrite) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

export function cliCreateBoardDeniedError(c: Context<AppBindings>): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (readCliGlobalPolicy().createBoard) return undefined;
  return c.json({ error: MSG_CREATE_BOARD }, 403);
}

export function cliEditBoardMetadataError(
  c: Context<AppBindings>,
  boardId: number,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (policyForBoard(boardId).editBoard) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

export function cliManageStructureError(
  c: Context<AppBindings>,
  boardId: number,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (policyForBoard(boardId).manageStructure) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

export function cliDeleteBoardError(
  c: Context<AppBindings>,
  boardId: number,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (policyForBoard(boardId).deleteBoard) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

export function cliCreateTasksError(
  c: Context<AppBindings>,
  boardId: number,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (policyForBoard(boardId).createTasks) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

export function cliCreateListsError(
  c: Context<AppBindings>,
  boardId: number,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (policyForBoard(boardId).createLists) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

function canManageTask(p: BoardCliPolicy, task: Task): boolean {
  if (p.manageAnyTasks) return true;
  const created = task.createdByPrincipal ?? "web";
  if (created === "cli" && p.manageCliCreatedTasks) return true;
  return false;
}

function canManageList(p: BoardCliPolicy, list: List): boolean {
  if (p.manageAnyLists) return true;
  const created = list.createdByPrincipal ?? "web";
  if (created === "cli" && p.manageCliCreatedLists) return true;
  return false;
}

export function cliManageTaskError(
  c: Context<AppBindings>,
  boardId: number,
  task: Task,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (canManageTask(policyForBoard(boardId), task)) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

export function cliManageListError(
  c: Context<AppBindings>,
  boardId: number,
  list: List,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (canManageList(policyForBoard(boardId), list)) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

/** List reorder / move operations that affect ordering across lists. */
export function cliManageAnyListsError(
  c: Context<AppBindings>,
  boardId: number,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (policyForBoard(boardId).manageAnyLists) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}

/** Task move/reorder when placement is constrained to CLI-managed tasks only is handled elsewhere; bulk reorder uses manage any tasks. */
export function cliManageAnyTasksError(
  c: Context<AppBindings>,
  boardId: number,
): Response | undefined {
  if (!isCliRequest(c)) return undefined;
  if (policyForBoard(boardId).manageAnyTasks) return undefined;
  return c.json({ error: MSG_WRITE }, 403);
}
