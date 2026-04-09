import { parsePortOption } from "../lib/command-helpers";
import {
  runReleasesAdd,
  runReleasesDelete,
  runReleasesList,
  runReleasesShow,
  runReleasesUpdate,
} from "../lib/writeCommands";
import type { CliContext } from "./context";

export async function handleReleasesList(
  ctx: CliContext,
  options: { port?: string; board: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runReleasesList({ port, board: options.board });
}

export async function handleReleasesShow(
  ctx: CliContext,
  releaseId: string,
  options: { port?: string; board: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runReleasesShow({
    port,
    board: options.board,
    releaseId,
  });
}

export async function handleReleasesAdd(
  ctx: CliContext,
  options: {
    port?: string;
    board: string;
    name: string;
    color?: string;
    clearColor?: boolean;
    releaseDate?: string;
    clearReleaseDate?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runReleasesAdd({
    port,
    board: options.board,
    name: options.name,
    color: options.color,
    clearColor: options.clearColor,
    releaseDate: options.releaseDate,
    clearReleaseDate: options.clearReleaseDate,
  });
}

export async function handleReleasesUpdate(
  ctx: CliContext,
  releaseId: string,
  options: {
    port?: string;
    board: string;
    name?: string;
    color?: string;
    clearColor?: boolean;
    releaseDate?: string;
    clearReleaseDate?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runReleasesUpdate({
    port,
    board: options.board,
    releaseId,
    name: options.name,
    color: options.color,
    clearColor: options.clearColor,
    releaseDate: options.releaseDate,
    clearReleaseDate: options.clearReleaseDate,
  });
}

export async function handleReleasesDelete(
  ctx: CliContext,
  releaseId: string,
  options: { port?: string; board: string; moveTasksTo?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runReleasesDelete({
    port,
    board: options.board,
    releaseId,
    moveTasksTo: options.moveTasksTo,
  });
}
