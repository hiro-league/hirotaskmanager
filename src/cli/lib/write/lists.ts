import type {
  ListDeleteMutationResult,
  ListMutationResult,
} from "../../../shared/mutationResults";
import { fetchApiMutate } from "../api-client";
import { CLI_ERR } from "../cli-error-codes";
import { parseOptionalEmojiFlag } from "../emoji-cli";
import { CliError, printJson } from "../output";
import { parsePositiveInt } from "./helpers";
import {
  compactListEntity,
  trashedEntity,
  writeSuccess,
  writeTrashMove,
} from "../write-result";
import type { Board } from "../../../shared/models";

export async function runListsAdd(opts: {
  port?: number;
  board: string | undefined;
  name?: string;
  emoji?: string;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
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
          boardId: result.boardId,
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
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const listId = parsePositiveInt("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
  }
  if (opts.clearColor && opts.color !== undefined) {
    throw new CliError("Cannot use --color together with --clear-color", 2, {
      code: CLI_ERR.mutuallyExclusiveOptions,
    });
  }
  if (opts.clearEmoji && opts.emoji !== undefined) {
    throw new CliError("Cannot use --emoji together with --clear-emoji", 2, {
      code: CLI_ERR.mutuallyExclusiveOptions,
    });
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
    throw new CliError("At least one update field is required", 2, {
      code: CLI_ERR.noUpdateFields,
    });
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
          boardId: result.boardId,
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
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const listId = parsePositiveInt("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
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
          boardId: result.boardId,
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
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const listId = parsePositiveInt("listId", opts.listId);
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: opts.listId,
    });
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
      { code: CLI_ERR.mutuallyExclusiveOptions },
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
    const moved = board.lists.find((list) => list.listId === listId);
    if (!moved) {
      throw new CliError("Moved list missing from board", 1, {
        code: CLI_ERR.responseInconsistent,
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
