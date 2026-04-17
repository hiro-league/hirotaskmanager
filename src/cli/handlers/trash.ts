import {
  runTrashBoards,
  runTrashLists,
  runTrashTasks,
} from "../lib/trash/trashCommands";
import type { CliContext } from "./context";

export async function handleTrashBoards(
  ctx: CliContext,
  options: {
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  await runTrashBoards(ctx, {
    port,
    limit: options.limit,
    offset: options.offset,
    pageAll: options.pageAll,
    countOnly: options.countOnly,
    fields: options.fields,
  });
}

export async function handleTrashLists(
  ctx: CliContext,
  options: {
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  await runTrashLists(ctx, {
    port,
    limit: options.limit,
    offset: options.offset,
    pageAll: options.pageAll,
    countOnly: options.countOnly,
    fields: options.fields,
  });
}

export async function handleTrashTasks(
  ctx: CliContext,
  options: {
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  await runTrashTasks(ctx, {
    port,
    limit: options.limit,
    offset: options.offset,
    pageAll: options.pageAll,
    countOnly: options.countOnly,
    fields: options.fields,
  });
}
