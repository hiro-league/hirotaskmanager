import type { Board } from "../../../shared/models";
import type {
  TaskDeleteMutationResult,
  TaskMutationResult,
} from "../../../shared/mutationResults";
import type { CliContext } from "../../types/context";
import { CLI_ERR } from "../../types/errors";
import { enrichNotFoundError } from "../cli-http-errors";
import { parseOptionalEmojiFlag } from "../emoji-cli";
import { CliError } from "../output";
import { assertMutuallyExclusive } from "../validation";
import {
  loadTextInput,
  parseCliReleaseFlags,
  parsePositiveInt,
  parseTaskId,
  resolveCliReleaseToApiValue,
  resolveExclusiveTextInput,
} from "./helpers";
import {
  compactTaskEntity,
  trashedEntity,
  writeSuccess,
  writeTrashMove,
} from "../write-result";

export async function runTasksAdd(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    list?: string;
    group?: string;
    title?: string;
    status?: string;
    priority?: string;
    /** Release name, or `none` for untagged. Omit both this and `releaseId` for server auto-assign when enabled. */
    release?: string;
    /** Numeric release id (mutually exclusive with `release`). */
    releaseId?: string;
    emoji?: string;
    clearEmoji?: boolean;
    body?: string;
    bodyFile?: string;
    bodyStdin?: boolean;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const listId = parsePositiveInt("listId", opts.list);
  const groupId = parsePositiveInt("groupId", opts.group);
  if (listId === undefined) {
    throw new CliError("Missing required option: --list", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  if (groupId === undefined) {
    throw new CliError("Missing required option: --group", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  assertMutuallyExclusive([
    ["--emoji", opts.emoji, "--clear-emoji", opts.clearEmoji],
  ]);

  // Task flags use body/bodyFile/bodyStdin; shared helpers take generic text/file/stdin.
  const bodyResolved = resolveExclusiveTextInput("body", {
    text: opts.body,
    file: opts.bodyFile,
    stdin: opts.bodyStdin,
  });
  const bodyText = bodyResolved ? await loadTextInput("body", bodyResolved) : "";

  const titleRaw = opts.title?.trim() ?? "";
  const title = titleRaw || "Untitled";
  const port = opts.port;

  const payload: Record<string, unknown> = {
    listId,
    groupId,
    title,
    body: bodyText,
    status: opts.status?.trim() || "open",
  };

  if (opts.priority !== undefined) {
    const p = parsePositiveInt("priorityId", opts.priority);
    if (p === undefined) {
      throw new CliError("Invalid priority id", 2, {
        code: CLI_ERR.invalidValue,
        priorityId: opts.priority,
      });
    }
    payload.priorityId = p;
  }

  const relInput = parseCliReleaseFlags({
    release: opts.release,
    releaseId: opts.releaseId,
  });
  if (relInput.mode !== "omit") {
    payload.releaseId = await resolveCliReleaseToApiValue(
      ctx,
      boardId,
      relInput,
      port,
    );
  }

  if (opts.clearEmoji) {
    payload.emoji = null;
  } else if (opts.emoji !== undefined) {
    const emojiOpt = parseOptionalEmojiFlag(opts.emoji);
    if (!emojiOpt.omit) payload.emoji = emojiOpt.value;
  }

  try {
    const result = await ctx.fetchApiMutate<TaskMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/tasks`,
      { method: "POST", body: payload },
      { port },
    );
    ctx.printJson(
      writeSuccess(
        {
          boardId: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        compactTaskEntity(result.entity),
      ),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}

export async function runTasksUpdate(
  ctx: CliContext,
  opts: {
  port?: number;
  board: string | undefined;
  taskId: string | undefined;
  title?: string;
  status?: string;
  list?: string;
  group?: string;
  priority?: string;
  release?: string;
  releaseId?: string;
  color?: string;
  clearColor?: boolean;
  emoji?: string;
  clearEmoji?: boolean;
  body?: string;
  bodyFile?: string;
  bodyStdin?: boolean;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const taskId = parseTaskId(opts.taskId);
  const port = opts.port;

  assertMutuallyExclusive([
    ["--color", opts.color, "--clear-color", opts.clearColor],
    ["--emoji", opts.emoji, "--clear-emoji", opts.clearEmoji],
  ]);

  // Task flags use body/bodyFile/bodyStdin; shared helpers take generic text/file/stdin.
  const bodyResolved = resolveExclusiveTextInput("body", {
    text: opts.body,
    file: opts.bodyFile,
    stdin: opts.bodyStdin,
  });
  const bodyText = bodyResolved
    ? await loadTextInput("body", bodyResolved)
    : undefined;

  const patch: Record<string, unknown> = {};
  if (opts.title !== undefined) patch.title = opts.title;
  if (opts.status !== undefined) patch.status = opts.status;
  if (opts.list !== undefined) {
    const lid = parsePositiveInt("listId", opts.list);
    if (lid === undefined) {
      throw new CliError("Invalid list id", 2, {
        code: CLI_ERR.invalidValue,
        listId: opts.list,
      });
    }
    patch.listId = lid;
  }
  if (opts.group !== undefined) {
    const gid = parsePositiveInt("groupId", opts.group);
    if (gid === undefined) {
      throw new CliError("Invalid group id", 2, {
        code: CLI_ERR.invalidValue,
        groupId: opts.group,
      });
    }
    patch.groupId = gid;
  }
  if (opts.priority !== undefined) {
    const pid = parsePositiveInt("priorityId", opts.priority);
    if (pid === undefined) {
      throw new CliError("Invalid priority id", 2, {
        code: CLI_ERR.invalidValue,
        priorityId: opts.priority,
      });
    }
    patch.priorityId = pid;
  }
  const relInput = parseCliReleaseFlags({
    release: opts.release,
    releaseId: opts.releaseId,
  });
  if (relInput.mode !== "omit") {
    patch.releaseId = await resolveCliReleaseToApiValue(
      ctx,
      boardId,
      relInput,
      port,
    );
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
    throw new CliError("At least one update field is required", 2, {
      code: CLI_ERR.noUpdateFields,
    });
  }

  try {
    const result = await ctx.fetchApiMutate<TaskMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/tasks/${taskId}`,
      { method: "PATCH", body: patch },
      { port },
    );
    ctx.printJson(
      writeSuccess(
        {
          boardId: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        compactTaskEntity(result.entity),
      ),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId, taskId });
  }
}

export async function runTasksDelete(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    taskId: string | undefined;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const taskId = parseTaskId(opts.taskId);

  try {
    const result = await ctx.fetchApiMutate<TaskDeleteMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/tasks/${taskId}`,
      { method: "DELETE" },
      { port: opts.port },
    );
    ctx.printJson(
      writeTrashMove(
        {
          boardId: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        trashedEntity("task", result.deletedTaskId),
      ),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId, taskId });
  }
}

export async function runTasksMove(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    taskId: string | undefined;
    toList?: string;
    toStatus?: string;
    beforeTask?: string;
    afterTask?: string;
    first?: boolean;
    last?: boolean;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const taskId = parseTaskId(opts.taskId);
  const toList = parsePositiveInt("listId", opts.toList);
  if (toList === undefined) {
    throw new CliError("Missing required option: --to-list", 2, {
      code: CLI_ERR.missingRequired,
    });
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
      { code: CLI_ERR.mutuallyExclusiveOptions },
    );
  }

  const port = opts.port;

  try {
    const board = await ctx.fetchApiMutate<Board>(
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
    const moved = board.tasks.find((task) => task.taskId === taskId);
    if (!moved) {
      throw new CliError("Moved task missing from board", 1, {
        code: CLI_ERR.responseInconsistent,
        board: boardId,
        taskId,
      });
    }
    ctx.printJson(
      writeSuccess(board, compactTaskEntity(moved)),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId, taskId });
  }
}
