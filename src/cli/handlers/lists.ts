import { confirmMutableAction } from "../lib/core/mutableActionConfirm";
import { runListsShow } from "../lib/queries/lists";
import { runListsPurge, runListsRestore } from "../lib/trash/trashCommands";
import {
  runListsAdd,
  runListsDelete,
  runListsList,
  runListsMove,
  runListsUpdate,
} from "../lib/mutations/writeCommands";
import type { CliContext } from "./context";

export async function handleListsShow(
  ctx: CliContext,
  listId: string,
  options: { fields?: string },
): Promise<void> {
  await runListsShow(ctx, listId, options);
}

export async function handleListsList(
  ctx: CliContext,
  options: {
    board: string;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  await runListsList(ctx, {
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
  options: { board: string; emoji?: string },
): Promise<void> {
  const port = ctx.resolvePort();
  await runListsAdd(ctx, {
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
    board: string;
    name?: string;
    color?: string;
    clearColor?: boolean;
    emoji?: string;
    clearEmoji?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  await runListsUpdate(ctx, {
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
  options: { board: string; yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort();
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `lists delete: move list ${listId} on board "${options.board}" to Trash.`,
      "Restore later with: hirotm lists restore <list-id>",
    ],
  });
  await runListsDelete(ctx, {
    port,
    board: options.board,
    listId,
  });
}

export async function handleListsRestore(
  ctx: CliContext,
  listId: string,
  options: { yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort();
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `lists restore: restore list ${listId} from Trash (the board must be active).`,
    ],
  });
  await runListsRestore(ctx, { port, listId });
}

export async function handleListsPurge(
  ctx: CliContext,
  listId: string,
  options: { yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort();
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `lists purge: permanently delete list ${listId} from Trash.`,
      "This cannot be undone.",
    ],
  });
  await runListsPurge(ctx, { port, listId });
}

export async function handleListsMove(
  ctx: CliContext,
  listId: string,
  options: {
    board: string;
    before?: string;
    after?: string;
    first?: boolean;
    last?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  await runListsMove(ctx, {
    port,
    board: options.board,
    listId,
    before: options.before,
    after: options.after,
    first: options.first,
    last: options.last,
  });
}
