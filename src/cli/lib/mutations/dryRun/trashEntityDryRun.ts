import type { Board } from "../../../../shared/models";
import type {
  TrashedListItem,
  TrashedTaskItem,
} from "../../../../shared/trashApi";
import type { CliContext } from "../../../types/context";
import { CLI_ERR } from "../../../types/errors";
import { enrichNotFoundError } from "../../client/cli-http-errors";
import { fetchAllPages } from "../../client/paginatedFetch";
import { CLI_DEFAULTS } from "../../core/constants";
import { compactBoardEntity, compactListEntity, compactTaskEntity } from "../write-result";
import {
  formatResolvedBoardRef,
  parsePositiveInt,
  parseTaskId,
  resolveListBoardRef,
  resolveTaskBoardRef,
} from "../write/helpers";
import { CliError } from "../../output/output";
import type { PaginatedListBody } from "../../../../shared/pagination";
import { resolveTrashedBoardId } from "../../trash/trashCommands";

async function findTrashedListById(
  ctx: CliContext,
  port: number | undefined,
  listId: number,
): Promise<TrashedListItem | undefined> {
  const pageSize = CLI_DEFAULTS.MAX_PAGE_LIMIT;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) q.set("offset", String(offset));
    return ctx.fetchApi<PaginatedListBody<TrashedListItem>>(
      `/trash/lists?${q.toString()}`,
      { port },
    );
  }, pageSize);
  return merged.items.find((r) => r.listId === listId);
}

async function findTrashedTaskById(
  ctx: CliContext,
  port: number | undefined,
  taskId: number,
): Promise<TrashedTaskItem | undefined> {
  const pageSize = CLI_DEFAULTS.MAX_PAGE_LIMIT;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) q.set("offset", String(offset));
    return ctx.fetchApi<PaginatedListBody<TrashedTaskItem>>(
      `/trash/tasks?${q.toString()}`,
      { port },
    );
  }, pageSize);
  return merged.items.find((r) => r.taskId === taskId);
}

/** `boards delete --dry-run` — GET board only; no DELETE. */
export async function dryRunBoardsDelete(
  ctx: CliContext,
  opts: { port?: number; board: string | undefined },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  try {
    const board = await ctx.fetchApi<Board>(
      `/boards/${encodeURIComponent(boardId)}`,
      { port: opts.port },
    );
    ctx.printJson({
      dryRun: true,
      action: "trash",
      entity: "board",
      target: compactBoardEntity(board),
    });
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}

/** `boards purge --dry-run` — resolve trashed ref only; no DELETE. */
export async function dryRunBoardsPurge(
  ctx: CliContext,
  opts: { port?: number; board: string | undefined },
): Promise<void> {
  const ref = opts.board?.trim();
  if (!ref) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const port = opts.port;
  const boardNumericId = await resolveTrashedBoardId(ctx, port, ref);
  ctx.printJson({
    dryRun: true,
    action: "purge",
    entity: "board",
    wouldPurge: { boardId: boardNumericId },
  });
}

/** `lists delete --dry-run` — board must contain the list. */
export async function dryRunListsDelete(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    listId: string | undefined;
  },
): Promise<void> {
  const listIdNum = parsePositiveInt("listId", opts.listId);
  if (listIdNum === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
  }
  let boardContext = opts.board?.trim();
  try {
    let boardId = boardContext;
    if (!boardId) {
      const resolvedBoard = await resolveListBoardRef(ctx, listIdNum, opts.port);
      boardContext = formatResolvedBoardRef(resolvedBoard);
      boardId = String(resolvedBoard.boardId);
    }
    if (!boardId) {
      throw new CliError("List response missing board metadata", 1, {
        code: CLI_ERR.responseInconsistent,
        listId: listIdNum,
      });
    }
    const board = await ctx.fetchApi<Board>(
      `/boards/${encodeURIComponent(boardId)}`,
      { port: opts.port },
    );
    const list = board.lists.find((l) => l.listId === listIdNum);
    if (!list) {
      throw new CliError("List not found on this board", 3, {
        code: CLI_ERR.notFound,
        board: boardId,
        listId: listIdNum,
      });
    }
    ctx.printJson({
      dryRun: true,
      action: "trash",
      entity: "list",
      board: { boardId: board.boardId, slug: board.slug ?? "" },
      target: compactListEntity(list),
    });
  } catch (e) {
    enrichNotFoundError(e, { board: boardContext, listId: listIdNum });
  }
}

/** `lists purge --dry-run` — trashed list must exist. */
export async function dryRunListsPurge(
  ctx: CliContext,
  opts: { port?: number; listId: string | undefined },
): Promise<void> {
  const listIdNum = parsePositiveInt("listId", opts.listId);
  if (listIdNum === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
  }
  const row = await findTrashedListById(ctx, opts.port, listIdNum);
  if (!row) {
    throw new CliError("List not in Trash", 3, {
      code: CLI_ERR.notFound,
      listId: listIdNum,
    });
  }
  ctx.printJson({
    dryRun: true,
    action: "purge",
    entity: "list",
    wouldPurge: {
      listId: listIdNum,
      name: row.name,
      boardId: row.boardId,
      boardName: row.boardName,
    },
  });
}

/** `tasks delete --dry-run` — task must exist on the given board. */
export async function dryRunTasksDelete(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    taskId: string | undefined;
  },
): Promise<void> {
  const taskId = parseTaskId(opts.taskId);
  let boardContext = opts.board?.trim();
  try {
    let boardId = boardContext;
    if (!boardId) {
      const resolvedBoard = await resolveTaskBoardRef(ctx, taskId, opts.port);
      boardContext = formatResolvedBoardRef(resolvedBoard);
      boardId = String(resolvedBoard.boardId);
    }
    if (!boardId) {
      throw new CliError("Task response missing board metadata", 1, {
        code: CLI_ERR.responseInconsistent,
        taskId,
      });
    }
    const board = await ctx.fetchApi<Board>(
      `/boards/${encodeURIComponent(boardId)}`,
      { port: opts.port },
    );
    const task = board.tasks.find((t) => t.taskId === taskId);
    if (!task) {
      throw new CliError("Task not found on this board", 3, {
        code: CLI_ERR.notFound,
        board: boardId,
        taskId,
      });
    }
    ctx.printJson({
      dryRun: true,
      action: "trash",
      entity: "task",
      board: { boardId: board.boardId, slug: board.slug ?? "" },
      target: compactTaskEntity(task),
    });
  } catch (e) {
    enrichNotFoundError(e, { board: boardContext, taskId });
  }
}

/** `tasks purge --dry-run` — trashed task must exist. */
export async function dryRunTasksPurge(
  ctx: CliContext,
  opts: { port?: number; taskId: string | undefined },
): Promise<void> {
  const taskIdNum = parsePositiveInt("taskId", opts.taskId);
  if (taskIdNum === undefined) {
    throw new CliError("Invalid task id", 2, {
      code: CLI_ERR.invalidValue,
      taskId: opts.taskId,
    });
  }
  const row = await findTrashedTaskById(ctx, opts.port, taskIdNum);
  if (!row) {
    throw new CliError("Task not in Trash", 3, {
      code: CLI_ERR.notFound,
      taskId: taskIdNum,
    });
  }
  ctx.printJson({
    dryRun: true,
    action: "purge",
    entity: "task",
    wouldPurge: {
      taskId: taskIdNum,
      title: row.title,
      boardId: row.boardId,
      boardName: row.boardName,
    },
  });
}
