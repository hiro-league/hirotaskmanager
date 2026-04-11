import { parsePortOption } from "../lib/command-helpers";
import { confirmMutableAction } from "../lib/mutableActionConfirm";
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
  await runReleasesList({
    port,
    board: options.board,
    limit: options.limit,
    offset: options.offset,
    pageAll: options.pageAll,
    fields: options.fields,
  });
}

export async function handleReleasesShow(
  ctx: CliContext,
  releaseId: string,
  options: { port?: string; board: string; fields?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runReleasesShow({
    port,
    board: options.board,
    releaseId,
    fields: options.fields,
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
  options: { port?: string; board: string; moveTasksTo?: string; yes?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const moveLine =
    options.moveTasksTo != null && String(options.moveTasksTo).trim() !== ""
      ? `Tasks on this release will be moved to release id ${options.moveTasksTo} before delete.`
      : "Tasks on this release will become untagged unless you use --move-tasks-to.";
  await confirmMutableAction({
    yes: options.yes === true,
    impactLines: [
      `releases delete: remove release ${releaseId} on board "${options.board}".`,
      moveLine,
    ],
  });
  await runReleasesDelete({
    port,
    board: options.board,
    releaseId,
    moveTasksTo: options.moveTasksTo,
  });
}
