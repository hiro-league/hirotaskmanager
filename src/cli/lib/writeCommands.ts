import { parseBoardColor } from "../../shared/boardColor";
import type { Board } from "../../shared/models";
import type {
  ListDeleteMutationResult,
  ListMutationResult,
  TaskDeleteMutationResult,
  TaskMutationResult,
} from "../../shared/mutationResults";
import { fetchApi, fetchApiMutate } from "./api-client";
import { parseOptionalEmojiFlag } from "./emoji-cli";
import { CliError, printJson } from "./output";
import { loadBodyText, resolveExclusiveBody } from "./task-body";
import {
  compactBoardEntity,
  compactListEntity,
  compactTaskEntity,
  trashedEntity,
  writeSuccess,
  writeTrashMove,
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

type TextInputSource = "flag" | "file" | "stdin";

function resolveExclusiveTextInput(
  label: string,
  options: {
    text?: string;
    file?: string;
    stdin?: boolean;
  },
): { source: TextInputSource; text: string } | undefined {
  const hasText = options.text !== undefined;
  const hasFile = Boolean(options.file?.trim());
  const hasStdin = Boolean(options.stdin);
  const count = (hasText ? 1 : 0) + (hasFile ? 1 : 0) + (hasStdin ? 1 : 0);
  if (count > 1) {
    throw new CliError(`Exactly one ${label} input source is allowed`, 2);
  }
  if (hasText) {
    return { source: "flag", text: options.text ?? "" };
  }
  if (hasFile) {
    return { source: "file", text: options.file!.trim() };
  }
  if (hasStdin) {
    return { source: "stdin", text: "" };
  }
  return undefined;
}

async function readStdinUtf8(): Promise<string> {
  return await new Response(Bun.stdin.stream()).text();
}

async function loadTextInput(
  label: string,
  resolved: { source: TextInputSource; text: string },
): Promise<string> {
  if (resolved.source === "flag") {
    return resolved.text;
  }
  if (resolved.source === "stdin") {
    return await readStdinUtf8();
  }
  const path = resolved.text;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new CliError(`${label} file not found`, 1, { path });
  }
  return await file.text();
}

async function loadJsonArrayInput(
  label: string,
  options: {
    json?: string;
    file?: string;
    stdin?: boolean;
  },
  propertyName: string,
): Promise<unknown[]> {
  const resolved = resolveExclusiveTextInput(label, {
    text: options.json,
    file: options.file,
    stdin: options.stdin,
  });
  if (!resolved) {
    throw new CliError(`One ${label} input source is required`, 2);
  }
  const text = await loadTextInput(label, resolved);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CliError(`Invalid ${label} JSON`, 2);
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>)[propertyName])
  ) {
    return (parsed as Record<string, unknown>)[propertyName] as unknown[];
  }
  throw new CliError(
    `${label} must be a JSON array or an object with ${propertyName}`,
    2,
  );
}

export async function runBoardsAdd(opts: {
  port?: number;
  name?: string;
  emoji?: string;
  description?: string;
  descriptionFile?: string;
  descriptionStdin?: boolean;
}): Promise<void> {
  const port = opts.port;
  const nameTrim = opts.name?.trim() ?? "";
  const emojiOpt = parseOptionalEmojiFlag(opts.emoji);
  const body: Record<string, unknown> = {};
  if (nameTrim) body.name = nameTrim;
  if (!emojiOpt.omit) body.emoji = emojiOpt.value;

  const descriptionResolved = resolveExclusiveTextInput("description", {
    text: opts.description,
    file: opts.descriptionFile,
    stdin: opts.descriptionStdin,
  });
  if (descriptionResolved) {
    // Align with POST /boards: trimmed plain text in JSON body.
    body.description = (await loadTextInput("description", descriptionResolved)).trim();
  }

  const board = await fetchApiMutate<Board>(
    "/boards",
    { method: "POST", body: Object.keys(body).length ? body : {} },
    { port },
  );
  printJson(writeSuccess(board, compactBoardEntity(board)));
}

export async function runBoardsUpdate(opts: {
  port?: number;
  board: string | undefined;
  name?: string;
  emoji?: string;
  clearEmoji?: boolean;
  boardColor?: string;
  clearBoardColor?: boolean;
  description?: string;
  descriptionFile?: string;
  descriptionStdin?: boolean;
  clearDescription?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2);
  }
  if (opts.clearEmoji && opts.emoji !== undefined) {
    throw new CliError("Cannot use --emoji together with --clear-emoji", 2);
  }
  if (opts.clearBoardColor && opts.boardColor !== undefined) {
    throw new CliError(
      "Cannot use --board-color together with --clear-board-color",
      2,
    );
  }
  if (opts.clearDescription) {
    const hasDescriptionInput =
      opts.description !== undefined ||
      Boolean(opts.descriptionFile?.trim()) ||
      Boolean(opts.descriptionStdin);
    if (hasDescriptionInput) {
      throw new CliError(
        "Cannot combine --clear-description with another description input",
        2,
      );
    }
  }

  const descriptionResolved = resolveExclusiveTextInput("description", {
    text: opts.description,
    file: opts.descriptionFile,
    stdin: opts.descriptionStdin,
  });

  const patch: Record<string, unknown> = {};
  if (opts.name !== undefined) patch.name = opts.name;
  if (opts.clearEmoji) patch.emoji = null;
  else if (opts.emoji !== undefined) {
    const emojiOpt = parseOptionalEmojiFlag(opts.emoji);
    if (!emojiOpt.omit) patch.emoji = emojiOpt.value;
  }
  if (opts.clearBoardColor) {
    patch.boardColor = null;
  } else if (opts.boardColor !== undefined) {
    const boardColor = parseBoardColor(opts.boardColor.trim());
    if (!boardColor) {
      throw new CliError("Invalid boardColor", 2, {
        boardColor: opts.boardColor,
      });
    }
    patch.boardColor = boardColor;
  }
  if (opts.clearDescription) {
    patch.description = null;
  } else if (descriptionResolved) {
    patch.description = await loadTextInput("description", descriptionResolved);
  }

  if (Object.keys(patch).length === 0) {
    throw new CliError("At least one update field is required", 2);
  }

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}`,
      { method: "PATCH", body: patch },
      { port: opts.port },
    );
    printJson(writeSuccess(board, compactBoardEntity(board)));
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}

export async function runBoardsDelete(opts: {
  port?: number;
  board: string | undefined;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2);
  }

  try {
    const board = await fetchApi<Board>(
      `/boards/${encodeURIComponent(boardId)}`,
      { port: opts.port },
    );
    await fetchApiMutate<void>(
      `/boards/${encodeURIComponent(boardId)}`,
      { method: "DELETE" },
      { port: opts.port },
    );
    printJson(
      writeTrashMove(
        { id: board.id, slug: board.slug },
        trashedEntity("board", board.id, board.slug),
      ),
    );
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}

export async function runBoardsGroups(opts: {
  port?: number;
  board: string | undefined;
  json?: string;
  file?: string;
  stdin?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2);
  }
  const taskGroups = await loadJsonArrayInput("task groups", opts, "taskGroups");

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/groups`,
      { method: "PATCH", body: { taskGroups } },
      { port: opts.port },
    );
    printJson(writeSuccess(board, compactBoardEntity(board)));
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}

export async function runBoardsPriorities(opts: {
  port?: number;
  board: string | undefined;
  json?: string;
  file?: string;
  stdin?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2);
  }
  const taskPriorities = await loadJsonArrayInput(
    "task priorities",
    opts,
    "taskPriorities",
  );

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/priorities`,
      { method: "PATCH", body: { taskPriorities } },
      { port: opts.port },
    );
    printJson(writeSuccess(board, compactBoardEntity(board)));
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
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
    const result = await fetchApiMutate<ListMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/lists`,
      { method: "POST", body: Object.keys(body).length ? body : {} },
      { port },
    );
    printJson(
      writeSuccess(
        {
          id: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        compactListEntity(result.entity),
      ),
    );
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}

export async function runListsUpdate(opts: {
  port?: number;
  board: string | undefined;
  listId: string | undefined;
  name?: string;
  color?: string;
  clearColor?: boolean;
  emoji?: string;
  clearEmoji?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2);
  }
  const listId = parsePositiveInt("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, { listId: opts.listId });
  }
  if (opts.clearColor && opts.color !== undefined) {
    throw new CliError("Cannot use --color together with --clear-color", 2);
  }
  if (opts.clearEmoji && opts.emoji !== undefined) {
    throw new CliError("Cannot use --emoji together with --clear-emoji", 2);
  }

  const patch: Record<string, unknown> = {};
  if (opts.name !== undefined) patch.name = opts.name;
  if (opts.clearColor) patch.color = null;
  else if (opts.color !== undefined) patch.color = opts.color;
  if (opts.clearEmoji) patch.emoji = null;
  else if (opts.emoji !== undefined) {
    const emojiOpt = parseOptionalEmojiFlag(opts.emoji);
    if (!emojiOpt.omit) patch.emoji = emojiOpt.value;
  }

  if (Object.keys(patch).length === 0) {
    throw new CliError("At least one update field is required", 2);
  }

  try {
    const result = await fetchApiMutate<ListMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/lists/${listId}`,
      { method: "PATCH", body: patch },
      { port: opts.port },
    );
    printJson(
      writeSuccess(
        {
          id: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        compactListEntity(result.entity),
      ),
    );
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    if (e instanceof CliError && e.message === "List not found") {
      throw new CliError(e.message, e.exitCode, {
        ...e.details,
        board: boardId,
        listId,
      });
    }
    throw e;
  }
}

export async function runListsDelete(opts: {
  port?: number;
  board: string | undefined;
  listId: string | undefined;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2);
  }
  const listId = parsePositiveInt("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, { listId: opts.listId });
  }

  try {
    const result = await fetchApiMutate<ListDeleteMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/lists/${listId}`,
      { method: "DELETE" },
      { port: opts.port },
    );
    printJson(
      writeTrashMove(
        {
          id: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        trashedEntity("list", result.deletedListId),
      ),
    );
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    if (e instanceof CliError && e.message === "List not found") {
      throw new CliError(e.message, e.exitCode, {
        ...e.details,
        board: boardId,
        listId,
      });
    }
    throw e;
  }
}

export async function runListsMove(opts: {
  port?: number;
  board: string | undefined;
  listId: string | undefined;
  before?: string;
  after?: string;
  first?: boolean;
  last?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2);
  }
  const listId = parsePositiveInt("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, { listId: opts.listId });
  }

  const beforeListId = parsePositiveInt("beforeListId", opts.before);
  const afterListId = parsePositiveInt("afterListId", opts.after);
  const placementCount =
    (beforeListId !== undefined ? 1 : 0) +
    (afterListId !== undefined ? 1 : 0) +
    (opts.first ? 1 : 0) +
    (opts.last ? 1 : 0);
  if (placementCount > 1) {
    throw new CliError(
      "Use only one of --before, --after, --first, or --last",
      2,
    );
  }

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/lists/move`,
      {
        method: "PUT",
        body: {
          listId,
          beforeListId,
          afterListId,
          position: opts.first ? "first" : opts.last ? "last" : undefined,
        },
      },
      { port: opts.port },
    );
    const moved = board.lists.find((list) => list.id === listId);
    if (!moved) {
      throw new CliError("Moved list missing from board", 1, {
        board: boardId,
        listId,
      });
    }
    printJson(writeSuccess(board, compactListEntity(moved)));
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    if (e instanceof CliError && e.message === "List not found") {
      throw new CliError(e.message, e.exitCode, {
        ...e.details,
        board: boardId,
        listId,
      });
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
    const result = await fetchApiMutate<TaskMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/tasks`,
      { method: "POST", body: payload },
      { port },
    );
    printJson(
      writeSuccess(
        {
          id: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        compactTaskEntity(result.entity),
      ),
    );
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
    const result = await fetchApiMutate<TaskMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/tasks/${taskId}`,
      { method: "PATCH", body: patch },
      { port },
    );
    printJson(
      writeSuccess(
        {
          id: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        compactTaskEntity(result.entity),
      ),
    );
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

export async function runTasksDelete(opts: {
  port?: number;
  board: string | undefined;
  taskId: string | undefined;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2);
  }
  const taskId = parseTaskId(opts.taskId);

  try {
    const result = await fetchApiMutate<TaskDeleteMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/tasks/${taskId}`,
      { method: "DELETE" },
      { port: opts.port },
    );
    printJson(
      writeTrashMove(
        {
          id: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        trashedEntity("task", result.deletedTaskId),
      ),
    );
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
  beforeTask?: string;
  afterTask?: string;
  first?: boolean;
  last?: boolean;
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
  const beforeTaskId = parsePositiveInt("beforeTaskId", opts.beforeTask);
  const afterTaskId = parsePositiveInt("afterTaskId", opts.afterTask);
  const placementCount =
    (beforeTaskId !== undefined ? 1 : 0) +
    (afterTaskId !== undefined ? 1 : 0) +
    (opts.first ? 1 : 0) +
    (opts.last ? 1 : 0);
  if (placementCount > 1) {
    throw new CliError(
      "Use only one of --before-task, --after-task, --first, or --last",
      2,
    );
  }

  const port = opts.port;

  try {
    const board = await fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/tasks/move`,
      {
        method: "PUT",
        body: {
          taskId,
          toListId: toList,
          toStatus: opts.toStatus?.trim() || undefined,
          beforeTaskId,
          afterTaskId,
          position: opts.first ? "first" : opts.last ? "last" : undefined,
        },
      },
      { port },
    );
    const moved = board.tasks.find((task) => task.id === taskId);
    if (!moved) {
      throw new CliError("Moved task missing from board", 1, {
        board: boardId,
        taskId,
      });
    }
    printJson(
      writeSuccess(board, compactTaskEntity(moved)),
    );
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
