import { parsePortOption } from "../lib/command-helpers";
import { runListsPurge, runListsRestore } from "../lib/trashCommands";
import {
  runListsAdd,
  runListsDelete,
  runListsMove,
  runListsUpdate,
} from "../lib/writeCommands";
import type { CliContext } from "./context";

export async function handleListsAdd(
  ctx: CliContext,
  name: string | undefined,
  options: { port?: string; board: string; emoji?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runListsAdd({
    port,
    board: options.board,
    name,
    emoji: options.emoji,
  });
}

export async function handleListsUpdate(
  ctx: CliContext,
  listId: string,
  options: {
    port?: string;
    board: string;
    name?: string;
    color?: string;
    clearColor?: boolean;
    emoji?: string;
    clearEmoji?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runListsUpdate({
    port,
    board: options.board,
    listId,
    name: options.name,
    color: options.color,
    clearColor: options.clearColor,
    emoji: options.emoji,
    clearEmoji: options.clearEmoji,
  });
}

export async function handleListsDelete(
  ctx: CliContext,
  listId: string,
  options: { port?: string; board: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runListsDelete({
    port,
    board: options.board,
    listId,
  });
}

export async function handleListsRestore(
  ctx: CliContext,
  listId: string,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runListsRestore({ port, listId });
}

export async function handleListsPurge(
  ctx: CliContext,
  listId: string,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runListsPurge({ port, listId });
}

export async function handleListsMove(
  ctx: CliContext,
  listId: string,
  options: {
    port?: string;
    board: string;
    before?: string;
    after?: string;
    first?: boolean;
    last?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runListsMove({
    port,
    board: options.board,
    listId,
    before: options.before,
    after: options.after,
    first: options.first,
    last: options.last,
  });
}
