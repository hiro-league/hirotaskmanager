import type { Board } from "../../shared/models";
import { fetchApiMutate } from "./api-client";
import { parseOptionalEmojiFlag } from "./emoji-cli";
import { CliError, printJson } from "./output";
import { loadBodyText, resolveExclusiveBody } from "./task-body";
import {
  compactBoardEntity,
  compactListEntity,
  compactTaskEntity,
  findNewestList,
  findNewestTask,
  findTaskById,
  writeSuccess,
} from "./write-result";
function parsePositiveInt(
  label: string,
  raw: string | undefined,
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError(`Invalid ${label}`, 2, { [label]: raw });
  }
  return n;
}

function parseTaskId(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError("Invalid task id", 2, { taskId: raw });
  }
  return n;
}

export async function runBoardsAdd(opts: {
  port?: number;
  name?: string;
  emoji?: string;
}): Promise<void> {
  const port = opts.port;
  const nameTrim = opts.name?.trim() ?? "";
  const emojiOpt = parseOptionalEmojiFlag(opts.emoji);
  const body: Record<string, unknown> = {};
  if (nameTrim) body.name = nameTrim;
  if (!emojiOpt.omit) body.emoji = emojiOpt.value;

  const board = await fetchApiMutate<Board>(
    "/boards",
    { method: "POST", body: Object.keys(body).length ? body : {} },
    { port },
  );
  printJson(writeSuccess(board, compactBoardEntity(board)));
}

export async function runListsAdd(opts: {
  port?: number;
  board: string | undefined;
  name?: string;
  emoji?: string;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2);
  }
  const port = opts.port;
  const nameTrim = opts.name?.trim() ?? "";
  const emojiOpt = parseOptionalEmojiFlag(opts.emoji);
  const body: Record<string, unknown> = {};
  if (nameTrim) body.name = nameTrim;
  if (!emojiOpt.omit) body.emoji = emojiOpt.value;

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/lists`,
      { method: "POST", body: Object.keys(body).length ? body : {} },
      { port },
    );
    const list = findNewestList(board);
    if (!list) {
      throw new CliError("List not found after create", 1);
    }
    printJson(writeSuccess(board, compactListEntity(list)));
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}

export async function runTasksAdd(opts: {
  port?: number;
  board: string | undefined;
  list?: string;
  group?: string;
  title?: string;
  status?: string;
  priority?: string;
  noPriority?: boolean;
  emoji?: string;
  clearEmoji?: boolean;
  body?: string;
  bodyFile?: string;
  bodyStdin?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2);
  }
  const listId = parsePositiveInt("listId", opts.list);
  const groupId = parsePositiveInt("groupId", opts.group);
  if (listId === undefined) {
    throw new CliError("Missing required option: --list", 2);
  }
  if (groupId === undefined) {
    throw new CliError("Missing required option: --group", 2);
  }
  if (opts.noPriority && opts.priority !== undefined) {
    throw new CliError(
      "Cannot use --priority together with --no-priority",
      2,
    );
  }
  if (opts.clearEmoji && opts.emoji !== undefined) {
    throw new CliError(
      "Cannot use --emoji together with --clear-emoji",
      2,
    );
  }

  const bodyResolved = resolveExclusiveBody({
    body: opts.body,
    bodyFile: opts.bodyFile,
    bodyStdin: opts.bodyStdin,
  });
  const bodyText = bodyResolved ? await loadBodyText(bodyResolved) : "";

  const titleRaw = opts.title?.trim() ?? "";
  const title = titleRaw || "Untitled";

  const payload: Record<string, unknown> = {
    listId,
    groupId,
    title,
    body: bodyText,
    status: opts.status?.trim() || "open",
  };

  if (opts.noPriority) {
    payload.priorityId = null;
  } else if (opts.priority !== undefined) {
    const p = parsePositiveInt("priorityId", opts.priority);
    if (p === undefined) {
      throw new CliError("Invalid priority id", 2);
    }
    payload.priorityId = p;
  }

  if (opts.clearEmoji) {
    payload.emoji = null;
  } else if (opts.emoji !== undefined) {
    const emojiOpt = parseOptionalEmojiFlag(opts.emoji);
    if (!emojiOpt.omit) payload.emoji = emojiOpt.value;
  }

  const port = opts.port;

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/tasks`,
      { method: "POST", body: payload },
      { port },
    );
    const task = findNewestTask(board);
    if (!task) {
      throw new CliError("Task not found after create", 1);
    }
    printJson(writeSuccess(board, compactTaskEntity(task)));
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}

export async function runTasksUpdate(opts: {
  port?: number;
  board: string | undefined;
  taskId: string | undefined;
  title?: string;
  status?: string;
  list?: string;
  group?: string;
  priority?: string;
  noPriority?: boolean;
  color?: string;
  clearColor?: boolean;
  emoji?: string;
  clearEmoji?: boolean;
  body?: string;
  bodyFile?: string;
  bodyStdin?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2);
  }
  const taskId = parseTaskId(opts.taskId);
  const port = opts.port;

  if (opts.noPriority && opts.priority !== undefined) {
    throw new CliError(
      "Cannot use --priority together with --no-priority",
      2,
    );
  }
  if (opts.clearColor && opts.color !== undefined) {
    throw new CliError("Cannot use --color together with --clear-color", 2);
  }
  if (opts.clearEmoji && opts.emoji !== undefined) {
    throw new CliError(
      "Cannot use --emoji together with --clear-emoji",
      2,
    );
  }

  const bodyResolved = resolveExclusiveBody({
    body: opts.body,
    bodyFile: opts.bodyFile,
    bodyStdin: opts.bodyStdin,
  });
  const bodyText = bodyResolved ? await loadBodyText(bodyResolved) : undefined;

  const patch: Record<string, unknown> = {};
  if (opts.title !== undefined) patch.title = opts.title;
  if (opts.status !== undefined) patch.status = opts.status;
  if (opts.list !== undefined) {
    const lid = parsePositiveInt("listId", opts.list);
    if (lid === undefined) throw new CliError("Invalid list id", 2);
    patch.listId = lid;
  }
  if (opts.group !== undefined) {
    const gid = parsePositiveInt("groupId", opts.group);
    if (gid === undefined) throw new CliError("Invalid group id", 2);
    patch.groupId = gid;
  }
  if (opts.noPriority) patch.priorityId = null;
  else if (opts.priority !== undefined) {
    const pid = parsePositiveInt("priorityId", opts.priority);
    if (pid === undefined) throw new CliError("Invalid priority id", 2);
    patch.priorityId = pid;
  }
  if (opts.clearColor) patch.color = null;
  else if (opts.color !== undefined) patch.color = opts.color;
  if (opts.clearEmoji) patch.emoji = null;
  else if (opts.emoji !== undefined) {
    const emojiOpt = parseOptionalEmojiFlag(opts.emoji);
    if (!emojiOpt.omit) patch.emoji = emojiOpt.value;
  }
  if (bodyText !== undefined) patch.body = bodyText;

  if (Object.keys(patch).length === 0) {
    throw new CliError("At least one update field is required", 2);
  }

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/tasks/${taskId}`,
      { method: "PATCH", body: patch },
      { port },
    );
    const task = findTaskById(board, taskId);
    if (!task) {
      throw new CliError("Task not found", 1, { board: boardId, taskId });
    }
    printJson(writeSuccess(board, compactTaskEntity(task)));
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    if (e instanceof CliError && e.message === "Task not found") {
      throw new CliError(e.message, e.exitCode, {
        ...e.details,
        board: boardId,
        taskId,
      });
    }
    throw e;
  }
}

export async function runTasksMove(opts: {
  port?: number;
  board: string | undefined;
  taskId: string | undefined;
  toList?: string;
  toStatus?: string;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2);
  }
  const taskId = parseTaskId(opts.taskId);
  const toList = parsePositiveInt("listId", opts.toList);
  if (toList === undefined) {
    throw new CliError("Missing required option: --to-list", 2);
  }

  const patch: Record<string, unknown> = { listId: toList };
  if (opts.toStatus !== undefined && opts.toStatus.trim() !== "") {
    patch.status = opts.toStatus.trim();
  }

  const port = opts.port;

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/tasks/${taskId}`,
      { method: "PATCH", body: patch },
      { port },
    );
    const task = findTaskById(board, taskId);
    if (!task) {
      throw new CliError("Task not found", 1, { board: boardId, taskId });
    }
    printJson(writeSuccess(board, compactTaskEntity(task)));
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    if (e instanceof CliError && e.message === "Task not found") {
      throw new CliError(e.message, e.exitCode, {
        ...e.details,
        board: boardId,
        taskId,
      });
    }
    throw e;
  }
}
