import { parsePortOption } from "../lib/command-helpers";
import {
  runTrashBoards,
  runTrashLists,
  runTrashTasks,
} from "../lib/trashCommands";
import type { CliContext } from "./context";

export async function handleTrashBoards(
  ctx: CliContext,
  options: {
    port?: string;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTrashBoards(ctx, {
    port,
    limit: options.limit,
    offset: options.offset,
    pageAll: options.pageAll,
    fields: options.fields,
  });
}

export async function handleTrashLists(
  ctx: CliContext,
  options: {
    port?: string;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTrashLists(ctx, {
    port,
    limit: options.limit,
    offset: options.offset,
    pageAll: options.pageAll,
    fields: options.fields,
  });
}

export async function handleTrashTasks(
  ctx: CliContext,
  options: {
    port?: string;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTrashTasks(ctx, {
    port,
    limit: options.limit,
    offset: options.offset,
    pageAll: options.pageAll,
    fields: options.fields,
  });
}
