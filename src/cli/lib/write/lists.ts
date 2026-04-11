import type { Board, List } from "../../../shared/models";
import type { PaginatedListBody } from "../../../shared/pagination";
import type {
  ListDeleteMutationResult,
  ListMutationResult,
} from "../../../shared/mutationResults";
import type { CliContext } from "../../types/context";
import { CLI_ERR } from "../../types/errors";
import { enrichNotFoundError } from "../cli-http-errors";
import { parseOptionalEmojiFlag } from "../emoji-cli";
import { FIELDS_LIST } from "../jsonFieldProjection";
import { COLUMNS_LISTS_LIST, QUIET_DEFAULT_LIST } from "../listTableSpecs";
import { executePaginatedListRead } from "../paginatedListRead";
import { CliError } from "../output";
import { assertMutuallyExclusive } from "../validation";
import { parsePositiveInt } from "./helpers";
import {
  compactListEntity,
  trashedEntity,
  writeSuccess,
  writeTrashMove,
} from "../write-result";

export async function runListsList(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const port = opts.port;
  await executePaginatedListRead(
    {
      kind: "optionalLimit",
      basePath: `/boards/${encodeURIComponent(boardId)}/lists`,
      fieldAllowlist: FIELDS_LIST,
      columns: COLUMNS_LISTS_LIST,
      quietDefaults: QUIET_DEFAULT_LIST,
      fetchPage: (path) =>
        ctx.fetchApi<PaginatedListBody<List>>(path, { port }),
    },
    {
      limit: opts.limit,
      offset: opts.offset,
      pageAll: opts.pageAll,
      fields: opts.fields,
    },
  );
}

export async function runListsAdd(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    name?: string;
    emoji?: string;
  },
): Promise<void> {
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
    const result = await ctx.fetchApiMutate<ListMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/lists`,
      { method: "POST", body: Object.keys(body).length ? body : {} },
      { port },
    );
    ctx.printJson(
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
    enrichNotFoundError(e, { board: boardId });
  }
}

export async function runListsUpdate(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    listId: string | undefined;
    name?: string;
    color?: string;
    clearColor?: boolean;
    emoji?: string;
    clearEmoji?: boolean;
  },
): Promise<void> {
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
  assertMutuallyExclusive([
    ["--color", opts.color, "--clear-color", opts.clearColor],
    ["--emoji", opts.emoji, "--clear-emoji", opts.clearEmoji],
  ]);

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
    const result = await ctx.fetchApiMutate<ListMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/lists/${listId}`,
      { method: "PATCH", body: patch },
      { port: opts.port },
    );
    ctx.printJson(
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
    enrichNotFoundError(e, { board: boardId, listId });
  }
}

export async function runListsDelete(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    listId: string | undefined;
  },
): Promise<void> {
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
    const result = await ctx.fetchApiMutate<ListDeleteMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/lists/${listId}`,
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
        trashedEntity("list", result.deletedListId),
      ),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId, listId });
  }
}

export async function runListsMove(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    listId: string | undefined;
    before?: string;
    after?: string;
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
    const board = await ctx.fetchApiMutate<Board>(
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
    ctx.printJson(writeSuccess(board, compactListEntity(moved)));
  } catch (e) {
    enrichNotFoundError(e, { board: boardId, listId });
  }
}
