import type { Board } from "../../shared/models";
import type {
  TrashedBoardItem,
  TrashedListItem,
  TrashedTaskItem,
} from "../../shared/trashApi";
import { fetchApi, fetchApiTrashMutate } from "./api-client";
import { CliError, printJson } from "./output";
import {
  compactBoardEntity,
  compactListEntity,
  compactTaskEntity,
  writeSuccess,
} from "./write-result";

function parsePositiveIntLabel(
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

/** Numeric board id string, or undefined if the argument looks like a slug. */
export function parseTrashedBoardNumericId(idOrSlug: string): number | undefined {
  const t = idOrSlug.trim();
  if (/^\d+$/.test(t)) {
    return Number(t);
  }
  return undefined;
}

export function resolveTrashedBoardIdFromSlug(
  idOrSlug: string,
  rows: TrashedBoardItem[],
): number {
  const slug = idOrSlug.trim().toLowerCase();
  const hit = rows.find((b) => b.slug.toLowerCase() === slug);
  if (!hit) {
    throw new CliError("Board not in Trash (no matching slug)", 1, {
      board: idOrSlug,
    });
  }
  return hit.id;
}

async function resolveTrashedBoardId(
  port: number | undefined,
  idOrSlug: string,
): Promise<number> {
  const numeric = parseTrashedBoardNumericId(idOrSlug);
  if (numeric !== undefined) {
    return numeric;
  }
  const rows = await fetchApi<TrashedBoardItem[]>("/trash/boards", { port });
  return resolveTrashedBoardIdFromSlug(idOrSlug, rows);
}

export async function runTrashBoards(opts: { port?: number }): Promise<void> {
  const rows = await fetchApi<TrashedBoardItem[]>("/trash/boards", {
    port: opts.port,
  });
  printJson(rows);
}

export async function runTrashLists(opts: { port?: number }): Promise<void> {
  const rows = await fetchApi<TrashedListItem[]>("/trash/lists", {
    port: opts.port,
  });
  printJson(rows);
}

export async function runTrashTasks(opts: { port?: number }): Promise<void> {
  const rows = await fetchApi<TrashedTaskItem[]>("/trash/tasks", {
    port: opts.port,
  });
  printJson(rows);
}

export async function runBoardsRestore(opts: {
  port?: number;
  board: string | undefined;
}): Promise<void> {
  const ref = opts.board?.trim();
  if (!ref) {
    throw new CliError("Missing required argument: <id-or-slug>", 2);
  }
  const port = opts.port;
  const boardNumericId = await resolveTrashedBoardId(port, ref);
  const result = await fetchApiTrashMutate<{ boardId: number; boardUpdatedAt: string }>(
    `/trash/boards/${boardNumericId}/restore`,
    { method: "POST" },
    { port },
  );
  const board = await fetchApi<Board>(`/boards/${result.boardId}`, { port });
  printJson(writeSuccess(board, compactBoardEntity(board)));
}

export async function runBoardsPurge(opts: {
  port?: number;
  board: string | undefined;
}): Promise<void> {
  const ref = opts.board?.trim();
  if (!ref) {
    throw new CliError("Missing required argument: <id-or-slug>", 2);
  }
  const port = opts.port;
  const boardNumericId = await resolveTrashedBoardId(port, ref);
  await fetchApiTrashMutate<void>(`/trash/boards/${boardNumericId}`, {
    method: "DELETE",
  }, { port });
  printJson({
    ok: true,
    purged: { type: "board" as const, id: boardNumericId },
  });
}

export async function runListsRestore(opts: {
  port?: number;
  listId: string | undefined;
}): Promise<void> {
  const listId = parsePositiveIntLabel("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, { listId: opts.listId });
  }
  const port = opts.port;
  const result = await fetchApiTrashMutate<{
    boardId: number;
    boardUpdatedAt: string;
    listId: number;
  }>(`/trash/lists/${listId}/restore`, { method: "POST" }, { port });
  const board = await fetchApi<Board>(`/boards/${result.boardId}`, { port });
  const list = board.lists.find((l) => l.id === result.listId);
  if (!list) {
    throw new CliError("Restored list missing from board payload", 1, {
      boardId: result.boardId,
      listId: result.listId,
    });
  }
  printJson(
    writeSuccess(
      {
        id: board.id,
        slug: board.slug ?? "",
        updatedAt: result.boardUpdatedAt,
      },
      compactListEntity(list),
    ),
  );
}

export async function runListsPurge(opts: {
  port?: number;
  listId: string | undefined;
}): Promise<void> {
  const listId = parsePositiveIntLabel("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, { listId: opts.listId });
  }
  const port = opts.port;
  await fetchApiTrashMutate<void>(`/trash/lists/${listId}`, {
    method: "DELETE",
  }, { port });
  printJson({
    ok: true,
    purged: { type: "list" as const, id: listId },
  });
}

export async function runTasksRestore(opts: {
  port?: number;
  taskId: string | undefined;
}): Promise<void> {
  const taskId = parsePositiveIntLabel("taskId", opts.taskId);
  if (taskId === undefined) {
    throw new CliError("Invalid task id", 2, { taskId: opts.taskId });
  }
  const port = opts.port;
  const result = await fetchApiTrashMutate<{
    boardId: number;
    boardUpdatedAt: string;
    taskId: number;
  }>(`/trash/tasks/${taskId}/restore`, { method: "POST" }, { port });
  const board = await fetchApi<Board>(`/boards/${result.boardId}`, { port });
  const task = board.tasks.find((t) => t.id === result.taskId);
  if (!task) {
    throw new CliError("Restored task missing from board payload", 1, {
      boardId: result.boardId,
      taskId: result.taskId,
    });
  }
  printJson(
    writeSuccess(
      {
        id: board.id,
        slug: board.slug ?? "",
        updatedAt: result.boardUpdatedAt,
      },
      compactTaskEntity(task),
    ),
  );
}

export async function runTasksPurge(opts: {
  port?: number;
  taskId: string | undefined;
}): Promise<void> {
  const taskId = parsePositiveIntLabel("taskId", opts.taskId);
  if (taskId === undefined) {
    throw new CliError("Invalid task id", 2, { taskId: opts.taskId });
  }
  const port = opts.port;
  await fetchApiTrashMutate<void>(`/trash/tasks/${taskId}`, {
    method: "DELETE",
  }, { port });
  printJson({
    ok: true,
    purged: { type: "task" as const, id: taskId },
  });
}
