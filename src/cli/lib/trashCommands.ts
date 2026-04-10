import type { PaginatedListBody } from "../../shared/pagination";
import type { Board } from "../../shared/models";
import type {
  TrashedBoardItem,
  TrashedListItem,
  TrashedTaskItem,
} from "../../shared/trashApi";
import { fetchApi, fetchApiTrashMutate } from "./api-client";
import { CLI_ERR } from "./cli-error-codes";
import {
  parseOptionalListLimit,
  parseOptionalOffset,
} from "./command-helpers";
import { fetchAllPages } from "./paginatedFetch";
import {
  FIELDS_TRASH_BOARD,
  FIELDS_TRASH_LIST,
  FIELDS_TRASH_TASK,
  parseAndValidateFields,
  projectPaginatedItems,
} from "./jsonFieldProjection";
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
    throw new CliError(`Invalid ${label}`, 2, {
      code: CLI_ERR.invalidValue,
      [label]: raw,
    });
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
    throw new CliError("Board not in Trash (no matching slug)", 3, {
      code: CLI_ERR.notFound,
      board: idOrSlug,
    });
  }
  return hit.boardId;
}

async function fetchAllTrashedBoards(
  port: number | undefined,
): Promise<TrashedBoardItem[]> {
  const pageSize = 500;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return fetchApi<PaginatedListBody<TrashedBoardItem>>(
      `/trash/boards?${q.toString()}`,
      { port },
    );
  }, pageSize);
  return merged.items;
}

async function resolveTrashedBoardId(
  port: number | undefined,
  idOrSlug: string,
): Promise<number> {
  const numeric = parseTrashedBoardNumericId(idOrSlug);
  if (numeric !== undefined) {
    return numeric;
  }
  const rows = await fetchAllTrashedBoards(port);
  return resolveTrashedBoardIdFromSlug(idOrSlug, rows);
}

export async function runTrashBoards(opts: {
  port?: number;
  limit?: string;
  offset?: string;
  pageAll?: boolean;
  fields?: string;
}): Promise<void> {
  const fieldKeys = parseAndValidateFields(opts.fields, FIELDS_TRASH_BOARD);
  const limitOpt = parseOptionalListLimit(opts.limit);
  const offsetOpt = parseOptionalOffset(opts.offset);
  const pageAll = opts.pageAll === true;
  const port = opts.port;

  if (!pageAll) {
    const q = new URLSearchParams();
    if (limitOpt != null) {
      q.set("limit", String(limitOpt));
    }
    if (offsetOpt > 0) {
      q.set("offset", String(offsetOpt));
    }
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await fetchApi<PaginatedListBody<TrashedBoardItem>>(
      `/trash/boards${suffix}`,
      { port },
    );
    printJson(
      fieldKeys ? projectPaginatedItems(body, fieldKeys) : body,
    );
    return;
  }

  const pageSize = limitOpt ?? 500;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return fetchApi<PaginatedListBody<TrashedBoardItem>>(
      `/trash/boards?${q.toString()}`,
      { port },
    );
  }, pageSize);
  printJson(fieldKeys ? projectPaginatedItems(merged, fieldKeys) : merged);
}

export async function runTrashLists(opts: {
  port?: number;
  limit?: string;
  offset?: string;
  pageAll?: boolean;
  fields?: string;
}): Promise<void> {
  const fieldKeys = parseAndValidateFields(opts.fields, FIELDS_TRASH_LIST);
  const limitOpt = parseOptionalListLimit(opts.limit);
  const offsetOpt = parseOptionalOffset(opts.offset);
  const pageAll = opts.pageAll === true;
  const port = opts.port;

  if (!pageAll) {
    const q = new URLSearchParams();
    if (limitOpt != null) {
      q.set("limit", String(limitOpt));
    }
    if (offsetOpt > 0) {
      q.set("offset", String(offsetOpt));
    }
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await fetchApi<PaginatedListBody<TrashedListItem>>(
      `/trash/lists${suffix}`,
      { port },
    );
    printJson(
      fieldKeys ? projectPaginatedItems(body, fieldKeys) : body,
    );
    return;
  }

  const pageSize = limitOpt ?? 500;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return fetchApi<PaginatedListBody<TrashedListItem>>(
      `/trash/lists?${q.toString()}`,
      { port },
    );
  }, pageSize);
  printJson(fieldKeys ? projectPaginatedItems(merged, fieldKeys) : merged);
}

export async function runTrashTasks(opts: {
  port?: number;
  limit?: string;
  offset?: string;
  pageAll?: boolean;
  fields?: string;
}): Promise<void> {
  const fieldKeys = parseAndValidateFields(opts.fields, FIELDS_TRASH_TASK);
  const limitOpt = parseOptionalListLimit(opts.limit);
  const offsetOpt = parseOptionalOffset(opts.offset);
  const pageAll = opts.pageAll === true;
  const port = opts.port;

  if (!pageAll) {
    const q = new URLSearchParams();
    if (limitOpt != null) {
      q.set("limit", String(limitOpt));
    }
    if (offsetOpt > 0) {
      q.set("offset", String(offsetOpt));
    }
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await fetchApi<PaginatedListBody<TrashedTaskItem>>(
      `/trash/tasks${suffix}`,
      { port },
    );
    printJson(
      fieldKeys ? projectPaginatedItems(body, fieldKeys) : body,
    );
    return;
  }

  const pageSize = limitOpt ?? 500;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return fetchApi<PaginatedListBody<TrashedTaskItem>>(
      `/trash/tasks?${q.toString()}`,
      { port },
    );
  }, pageSize);
  printJson(fieldKeys ? projectPaginatedItems(merged, fieldKeys) : merged);
}

export async function runBoardsRestore(opts: {
  port?: number;
  board: string | undefined;
}): Promise<void> {
  const ref = opts.board?.trim();
  if (!ref) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
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
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const port = opts.port;
  const boardNumericId = await resolveTrashedBoardId(port, ref);
  await fetchApiTrashMutate<void>(`/trash/boards/${boardNumericId}`, {
    method: "DELETE",
  }, { port });
  printJson({
    ok: true,
    purged: { type: "board" as const, boardId: boardNumericId },
  });
}

export async function runListsRestore(opts: {
  port?: number;
  listId: string | undefined;
}): Promise<void> {
  const listId = parsePositiveIntLabel("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
  }
  const port = opts.port;
  const result = await fetchApiTrashMutate<{
    boardId: number;
    boardUpdatedAt: string;
    listId: number;
  }>(`/trash/lists/${listId}/restore`, { method: "POST" }, { port });
  const board = await fetchApi<Board>(`/boards/${result.boardId}`, { port });
  const list = board.lists.find((l) => l.listId === result.listId);
  if (!list) {
    throw new CliError("Restored list missing from board payload", 1, {
      code: CLI_ERR.responseInconsistent,
      boardId: result.boardId,
      listId: result.listId,
    });
  }
  printJson(
    writeSuccess(
      {
        boardId: board.boardId,
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
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
  }
  const port = opts.port;
  await fetchApiTrashMutate<void>(`/trash/lists/${listId}`, {
    method: "DELETE",
  }, { port });
  printJson({
    ok: true,
    purged: { type: "list" as const, listId },
  });
}

export async function runTasksRestore(opts: {
  port?: number;
  taskId: string | undefined;
}): Promise<void> {
  const taskId = parsePositiveIntLabel("taskId", opts.taskId);
  if (taskId === undefined) {
    throw new CliError("Invalid task id", 2, {
      code: CLI_ERR.invalidValue,
      taskId: opts.taskId,
    });
  }
  const port = opts.port;
  const result = await fetchApiTrashMutate<{
    boardId: number;
    boardUpdatedAt: string;
    taskId: number;
  }>(`/trash/tasks/${taskId}/restore`, { method: "POST" }, { port });
  const board = await fetchApi<Board>(`/boards/${result.boardId}`, { port });
  const task = board.tasks.find((t) => t.taskId === result.taskId);
  if (!task) {
    throw new CliError("Restored task missing from board payload", 1, {
      code: CLI_ERR.responseInconsistent,
      boardId: result.boardId,
      taskId: result.taskId,
    });
  }
  printJson(
    writeSuccess(
      {
        boardId: board.boardId,
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
    throw new CliError("Invalid task id", 2, {
      code: CLI_ERR.invalidValue,
      taskId: opts.taskId,
    });
  }
  const port = opts.port;
  await fetchApiTrashMutate<void>(`/trash/tasks/${taskId}`, {
    method: "DELETE",
  }, { port });
  printJson({
    ok: true,
    purged: { type: "task" as const, taskId },
  });
}
