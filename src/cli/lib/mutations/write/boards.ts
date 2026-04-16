import { parseBoardColor } from "../../../../shared/boardColor";
import type { Board } from "../../../../shared/models";
import { parsePatchBoardTaskGroupConfigBody } from "../../../../shared/taskGroupConfig";
import type { CliContext } from "../../../types/context";
import { CLI_ERR } from "../../../types/errors";
import { enrichNotFoundError } from "../../client/cli-http-errors";
import { parseOptionalEmojiFlag } from "../../output/emoji-cli";
import { CliError } from "../../output/output";
import { assertMutuallyExclusive } from "../../core/validation";
import {
  loadJsonArrayInput,
  loadJsonObjectInput,
  loadTextInput,
  resolveExclusiveTextInput,
} from "./helpers";
import {
  compactBoardEntity,
  trashedEntity,
  writeSuccess,
  writeTrashMove,
} from "../write-result";

export async function runBoardsAdd(
  ctx: CliContext,
  opts: {
    port?: number;
    name?: string;
    emoji?: string;
    description?: string;
    descriptionFile?: string;
    descriptionStdin?: boolean;
  },
): Promise<void> {
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
    body.description = (
      await loadTextInput("description", descriptionResolved)
    ).trim();
  }

  const board = await ctx.fetchApiMutate<Board>(
    "/boards",
    { method: "POST", body: Object.keys(body).length ? body : {} },
    { port },
  );
  ctx.printJson(writeSuccess(board, compactBoardEntity(board)));
}

export async function runBoardsUpdate(
  ctx: CliContext,
  opts: {
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
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  assertMutuallyExclusive([
    ["--emoji", opts.emoji, "--clear-emoji", opts.clearEmoji],
    [
      "--board-color",
      opts.boardColor,
      "--clear-board-color",
      opts.clearBoardColor,
    ],
  ]);
  if (opts.clearDescription) {
    const hasDescriptionInput =
      opts.description !== undefined ||
      Boolean(opts.descriptionFile?.trim()) ||
      Boolean(opts.descriptionStdin);
    if (hasDescriptionInput) {
      throw new CliError(
        "Cannot combine --clear-description with another description input",
        2,
        { code: CLI_ERR.conflictingClearWithInput },
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
        code: CLI_ERR.invalidValue,
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
    throw new CliError("At least one update field is required", 2, {
      code: CLI_ERR.noUpdateFields,
    });
  }

  try {
    const board = await ctx.fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}`,
      { method: "PATCH", body: patch },
      { port: opts.port },
    );
    ctx.printJson(writeSuccess(board, compactBoardEntity(board)));
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}

export async function runBoardsDelete(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
  },
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
    await ctx.fetchApiMutate<void>(
      `/boards/${encodeURIComponent(boardId)}`,
      { method: "DELETE" },
      { port: opts.port },
    );
    ctx.printJson(
      writeTrashMove(
        { boardId: board.boardId, slug: board.slug },
        trashedEntity("board", board.boardId, board.slug),
      ),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}

export async function runBoardsGroups(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    json?: string;
    file?: string;
    stdin?: boolean;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const raw = await loadJsonObjectInput("task groups", opts);
  const parsed = parsePatchBoardTaskGroupConfigBody(raw);
  if (!parsed.ok) {
    // Task group config patch: validation message from shared parser (not emoji-only).
    throw new CliError(parsed.error, 2, { code: CLI_ERR.invalidInputShape });
  }

  try {
    const board = await ctx.fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/groups`,
      { method: "PATCH", body: parsed.value },
      { port: opts.port },
    );
    ctx.printJson(writeSuccess(board, compactBoardEntity(board)));
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}

export async function runBoardsPriorities(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    json?: string;
    file?: string;
    stdin?: boolean;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const taskPriorities = await loadJsonArrayInput(
    "task priorities",
    opts,
    "taskPriorities",
  );

  try {
    const board = await ctx.fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}/priorities`,
      { method: "PATCH", body: { taskPriorities } },
      { port: opts.port },
    );
    ctx.printJson(writeSuccess(board, compactBoardEntity(board)));
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}
