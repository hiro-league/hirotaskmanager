import { parsePortOption } from "../lib/command-helpers";
import {
  runTrashBoards,
  runTrashLists,
  runTrashTasks,
} from "../lib/trashCommands";
import type { CliContext } from "./context";

export async function handleTrashBoards(
  ctx: CliContext,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTrashBoards({ port });
}

export async function handleTrashLists(
  ctx: CliContext,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTrashLists({ port });
}

export async function handleTrashTasks(
  ctx: CliContext,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTrashTasks({ port });
}
