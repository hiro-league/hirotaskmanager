import {
  parseBoardDescribeEntities,
  type BoardDescribeResponse,
} from "../../shared/boardDescribe";
import { parsePortOption, requireNdjsonWhenQuiet } from "../lib/command-helpers";
import { getCliQuiet } from "../lib/cliFormat";
import { confirmMutableAction } from "../lib/mutableActionConfirm";
import { runBoardsList } from "../lib/read/boards";
import { runBoardsTasksList } from "../lib/read/tasks";
import {
  runBoardsAdd,
  runBoardsDelete,
  runBoardsGroups,
  runBoardsPriorities,
  runBoardsUpdate,
} from "../lib/writeCommands";
import {
  runBoardsPurge,
  runBoardsRestore,
} from "../lib/trashCommands";
import { printBoardDescribeResponse } from "../lib/boardDescribeOutput";
import { CLI_ERR } from "../types/errors";
import { CliError } from "../lib/output";
import type { CliContext } from "./context";

export async function handleBoardsList(
  ctx: CliContext,
  options: {
    port?: string;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  await runBoardsList(ctx, options);
}

export async function handleBoardsDescribe(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string; entities?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  // Multi-line NDJSON / human tables cannot be collapsed to one identifier per line.
  if (getCliQuiet()) {
    throw new CliError("--quiet is not supported for boards describe", 2, {
      code: CLI_ERR.invalidValue,
    });
  }
  const parsed = parseBoardDescribeEntities(
    options.entities === undefined
      ? undefined
      : options.entities.trim(),
  );
  if (!parsed.ok) {
    throw new CliError(parsed.error, 2, { code: CLI_ERR.invalidValue });
  }
  let path = `/boards/${encodeURIComponent(idOrSlug)}/describe`;
  if (!parsed.includeAll) {
    const q = new URLSearchParams();
    q.set(
      "entities",
      [...parsed.set].sort((a, b) => a.localeCompare(b, "en")).join(","),
    );
    path += `?${q.toString()}`;
  }
  const body = await ctx.fetchApi<BoardDescribeResponse>(path, { port });
  requireNdjsonWhenQuiet();
  printBoardDescribeResponse(body, parsed);
}

export async function handleBoardsTasks(
  ctx: CliContext,
  idOrSlug: string,
  options: {
    port?: string;
    list?: string;
    group?: string[];
    priority?: string[];
    status?: string[];
    releaseId?: string[];
    untagged?: boolean;
    dateMode?: string;
    from?: string;
    to?: string;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  await runBoardsTasksList(ctx, idOrSlug, options);
}

export async function handleBoardsAdd(
  ctx: CliContext,
  name: string | undefined,
  options: {
    port?: string;
    emoji?: string;
    description?: string;
    descriptionFile?: string;
    descriptionStdin?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runBoardsAdd(ctx, {
    port,
    name,
    emoji: options.emoji,
    description: options.description,
    descriptionFile: options.descriptionFile,
    descriptionStdin: options.descriptionStdin,
  });
}

export async function handleBoardsUpdate(
  ctx: CliContext,
  idOrSlug: string,
  options: {
    port?: string;
    name?: string;
    emoji?: string;
    clearEmoji?: boolean;
    description?: string;
    descriptionFile?: string;
    descriptionStdin?: boolean;
    clearDescription?: boolean;
    boardColor?: string;
    clearBoardColor?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runBoardsUpdate(ctx, {
    port,
    board: idOrSlug,
    name: options.name,
    emoji: options.emoji,
    clearEmoji: options.clearEmoji,
    description: options.description,
    descriptionFile: options.descriptionFile,
    descriptionStdin: options.descriptionStdin,
    clearDescription: options.clearDescription,
    boardColor: options.boardColor,
    clearBoardColor: options.clearBoardColor,
  });
}

export async function handleBoardsDelete(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string; yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `boards delete: move board "${idOrSlug}" to Trash.`,
      "You can restore it later with: hirotm boards restore <id-or-slug>",
    ],
  });
  await runBoardsDelete(ctx, { port, board: idOrSlug });
}

export async function handleBoardsRestore(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string; yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `boards restore: restore board "${idOrSlug}" from Trash to the active board list.`,
    ],
  });
  await runBoardsRestore(ctx, { port, board: idOrSlug });
}

export async function handleBoardsPurge(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string; yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `boards purge: permanently delete board "${idOrSlug}" from Trash.`,
      "This cannot be undone.",
    ],
  });
  await runBoardsPurge(ctx, { port, board: idOrSlug });
}

export async function handleBoardsGroups(
  ctx: CliContext,
  idOrSlug: string,
  options: {
    port?: string;
    json?: string;
    file?: string;
    stdin?: boolean;
    yes?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await confirmMutableAction({
    yes: options.yes === true,
    stdinReservedForPayload: options.stdin === true,
    impactLines: [
      `boards configure groups: replace task groups on board "${idOrSlug}" from your JSON input.`,
      "Creates, updates, and deletes in the payload apply; groups not listed may be removed — data loss is possible.",
    ],
  });
  await runBoardsGroups(ctx, {
    port,
    board: idOrSlug,
    json: options.json,
    file: options.file,
    stdin: options.stdin,
  });
}

export async function handleBoardsPriorities(
  ctx: CliContext,
  idOrSlug: string,
  options: {
    port?: string;
    json?: string;
    file?: string;
    stdin?: boolean;
    yes?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await confirmMutableAction({
    yes: options.yes === true,
    stdinReservedForPayload: options.stdin === true,
    impactLines: [
      `boards configure priorities: replace task priorities on board "${idOrSlug}" from your JSON input.`,
      "This overwrites priority definitions; omitted priorities may be removed — data loss is possible.",
    ],
  });
  await runBoardsPriorities(ctx, {
    port,
    board: idOrSlug,
    json: options.json,
    file: options.file,
    stdin: options.stdin,
  });
}
