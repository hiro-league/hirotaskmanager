import type { PaginatedListBody } from "../../../shared/pagination";
import type { Board } from "../../../shared/models";
import type {
  TrashedBoardItem,
  TrashedListItem,
  TrashedTaskItem,
} from "../../../shared/trashApi";
import type { CliContext } from "../../types/context";
import { CLI_ERR } from "../../types/errors";
import { CLI_DEFAULTS } from "../core/constants";
import {
  FIELDS_TRASH_BOARD,
  FIELDS_TRASH_LIST,
  FIELDS_TRASH_TASK,
} from "../core/jsonFieldProjection";
import {
  COLUMNS_TRASH_BOARDS,
  COLUMNS_TRASH_LISTS,
  COLUMNS_TRASH_TASKS,
  QUIET_DEFAULT_TRASH_BOARD,
  QUIET_DEFAULT_TRASH_LIST,
  QUIET_DEFAULT_TRASH_TASK,
} from "../core/listTableSpecs";
import { executePaginatedListRead } from "../client/paginatedListRead";
import { fetchAllPages } from "../client/paginatedFetch";
import { CliError } from "../output/output";
import {
  compactBoardEntity,
  compactListEntity,
  compactTaskEntity,
  writeSuccess,
} from "../mutations/write-result";
import { parsePositiveInt } from "../mutations/write/helpers";

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
  ctx: CliContext,
  port: number | undefined,
): Promise<TrashedBoardItem[]> {
  const pageSize = CLI_DEFAULTS.MAX_PAGE_LIMIT;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return ctx.fetchApi<PaginatedListBody<TrashedBoardItem>>(
      `/trash/boards?${q.toString()}`,
      { port },
    );
  }, pageSize);
  return merged.items;
}

/** Resolve a trashed board ref (numeric id or slug in Trash) for restore/purge/dry-run. */
export async function resolveTrashedBoardId(
  ctx: CliContext,
  port: number | undefined,
  idOrSlug: string,
): Promise<number> {
  const numeric = parseTrashedBoardNumericId(idOrSlug);
  if (numeric !== undefined) {
    return numeric;
  }
  const rows = await fetchAllTrashedBoards(ctx, port);
  return resolveTrashedBoardIdFromSlug(idOrSlug, rows);
}

export async function runTrashBoards(
  ctx: CliContext,
  opts: {
    port?: number;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = opts.port;
  await executePaginatedListRead(
    {
      kind: "optionalLimit",
      basePath: "/trash/boards",
      fieldAllowlist: FIELDS_TRASH_BOARD,
      columns: COLUMNS_TRASH_BOARDS,
      quietDefaults: QUIET_DEFAULT_TRASH_BOARD,
      fetchPage: (path) =>
        ctx.fetchApi<PaginatedListBody<TrashedBoardItem>>(path, { port }),
    },
    opts,
  );
}

export async function runTrashLists(
  ctx: CliContext,
  opts: {
    port?: number;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = opts.port;
  await executePaginatedListRead(
    {
      kind: "optionalLimit",
      basePath: "/trash/lists",
      fieldAllowlist: FIELDS_TRASH_LIST,
      columns: COLUMNS_TRASH_LISTS,
      quietDefaults: QUIET_DEFAULT_TRASH_LIST,
      fetchPage: (path) =>
        ctx.fetchApi<PaginatedListBody<TrashedListItem>>(path, { port }),
    },
    opts,
  );
}

export async function runTrashTasks(
  ctx: CliContext,
  opts: {
    port?: number;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = opts.port;
  await executePaginatedListRead(
    {
      kind: "optionalLimit",
      basePath: "/trash/tasks",
      fieldAllowlist: FIELDS_TRASH_TASK,
      columns: COLUMNS_TRASH_TASKS,
      quietDefaults: QUIET_DEFAULT_TRASH_TASK,
      fetchPage: (path) =>
        ctx.fetchApi<PaginatedListBody<TrashedTaskItem>>(path, { port }),
    },
    opts,
  );
}

export async function runBoardsRestore(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
  },
): Promise<void> {
  const ref = opts.board?.trim();
  if (!ref) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const port = opts.port;
  const boardNumericId = await resolveTrashedBoardId(ctx, port, ref);
  const result = await ctx.fetchApiTrashMutate<{
    boardId: number;
    boardUpdatedAt: string;
  }>(
    `/trash/boards/${boardNumericId}/restore`,
    { method: "POST" },
    { port },
  );
  const board = await ctx.fetchApi<Board>(`/boards/${result.boardId}`, { port });
  ctx.printJson(writeSuccess(board, compactBoardEntity(board)));
}

export async function runBoardsPurge(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
  },
): Promise<void> {
  const ref = opts.board?.trim();
  if (!ref) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const port = opts.port;
  const boardNumericId = await resolveTrashedBoardId(ctx, port, ref);
  await ctx.fetchApiTrashMutate<void>(
    `/trash/boards/${boardNumericId}`,
    {
      method: "DELETE",
    },
    { port },
  );
  ctx.printJson({
    ok: true,
    purged: { type: "board" as const, boardId: boardNumericId },
  });
}

export async function runListsRestore(
  ctx: CliContext,
  opts: {
    port?: number;
    listId: string | undefined;
  },
): Promise<void> {
  const listId = parsePositiveInt("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
  }
  const port = opts.port;
  const result = await ctx.fetchApiTrashMutate<{
    boardId: number;
    boardUpdatedAt: string;
    listId: number;
  }>(`/trash/lists/${listId}/restore`, { method: "POST" }, { port });
  const board = await ctx.fetchApi<Board>(`/boards/${result.boardId}`, { port });
  const list = board.lists.find((l) => l.listId === result.listId);
  if (!list) {
    throw new CliError("Restored list missing from board payload", 1, {
      code: CLI_ERR.responseInconsistent,
      boardId: result.boardId,
      listId: result.listId,
    });
  }
  ctx.printJson(
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

export async function runListsPurge(
  ctx: CliContext,
  opts: {
    port?: number;
    listId: string | undefined;
  },
): Promise<void> {
  const listId = parsePositiveInt("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
  }
  const port = opts.port;
  await ctx.fetchApiTrashMutate<void>(
    `/trash/lists/${listId}`,
    {
      method: "DELETE",
    },
    { port },
  );
  ctx.printJson({
    ok: true,
    purged: { type: "list" as const, listId },
  });
}

export async function runTasksRestore(
  ctx: CliContext,
  opts: {
    port?: number;
    taskId: string | undefined;
  },
): Promise<void> {
  const taskId = parsePositiveInt("taskId", opts.taskId);
  if (taskId === undefined) {
    throw new CliError("Invalid task id", 2, {
      code: CLI_ERR.invalidValue,
      taskId: opts.taskId,
    });
  }
  const port = opts.port;
  const result = await ctx.fetchApiTrashMutate<{
    boardId: number;
    boardUpdatedAt: string;
    taskId: number;
  }>(`/trash/tasks/${taskId}/restore`, { method: "POST" }, { port });
  const board = await ctx.fetchApi<Board>(`/boards/${result.boardId}`, { port });
  const task = board.tasks.find((t) => t.taskId === result.taskId);
  if (!task) {
    throw new CliError("Restored task missing from board payload", 1, {
      code: CLI_ERR.responseInconsistent,
      boardId: result.boardId,
      taskId: result.taskId,
    });
  }
  ctx.printJson(
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

export async function runTasksPurge(
  ctx: CliContext,
  opts: {
    port?: number;
    taskId: string | undefined;
  },
): Promise<void> {
  const taskId = parsePositiveInt("taskId", opts.taskId);
  if (taskId === undefined) {
    throw new CliError("Invalid task id", 2, {
      code: CLI_ERR.invalidValue,
      taskId: opts.taskId,
    });
  }
  const port = opts.port;
  await ctx.fetchApiTrashMutate<void>(
    `/trash/tasks/${taskId}`,
    {
      method: "DELETE",
    },
    { port },
  );
  ctx.printJson({
    ok: true,
    purged: { type: "task" as const, taskId },
  });
}
