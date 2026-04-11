import { parsePortOption } from "../lib/command-helpers";
import { confirmMutableAction } from "../lib/mutableActionConfirm";
import { runListsPurge, runListsRestore } from "../lib/trashCommands";
import {
  runListsAdd,
  runListsDelete,
  runListsList,
  runListsMove,
  runListsUpdate,
} from "../lib/writeCommands";
import type { CliContext } from "./context";

export async function handleListsList(
  ctx: CliContext,
  options: {
    port?: string;
    board: string;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runListsList({
    port,
    board: options.board,
    limit: options.limit,
    offset: options.offset,
    pageAll: options.pageAll,
    fields: options.fields,
  });
}

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
  options: { port?: string; board: string; yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `lists delete: move list ${listId} on board "${options.board}" to Trash.`,
      "Restore later with: hirotm lists restore <list-id>",
    ],
  });
  await runListsDelete({
    port,
    board: options.board,
    listId,
  });
}

export async function handleListsRestore(
  ctx: CliContext,
  listId: string,
  options: { port?: string; yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `lists restore: restore list ${listId} from Trash (the board must be active).`,
    ],
  });
  await runListsRestore({ port, listId });
}

export async function handleListsPurge(
  ctx: CliContext,
  listId: string,
  options: { port?: string; yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `lists purge: permanently delete list ${listId} from Trash.`,
      "This cannot be undone.",
    ],
  });
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
