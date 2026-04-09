import { RELEASE_FILTER_UNTAGGED } from "../../shared/boardFilters";
import type { Board, BoardIndexEntry, Task } from "../../shared/models";
import { parsePortOption } from "../lib/command-helpers";
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
import type { CliContext } from "./context";

export async function handleBoardsList(
  ctx: CliContext,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const boards = await ctx.fetchApi<BoardIndexEntry[]>("/boards", { port });
  ctx.printJson(boards);
}

export async function handleBoardsShow(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const board = await ctx.fetchApi<Board>(
    `/boards/${encodeURIComponent(idOrSlug)}`,
    { port },
  );
  ctx.printJson(board);
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
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const params = new URLSearchParams();
  if (options.list?.trim()) params.set("listId", options.list.trim());
  for (const group of options.group ?? []) {
    params.append("groupId", group);
  }
  for (const priority of options.priority ?? []) {
    params.append("priorityId", priority);
  }
  for (const status of options.status ?? []) {
    params.append("status", status);
  }
  for (const rid of options.releaseId ?? []) {
    params.append("releaseId", rid);
  }
  if (options.untagged) {
    params.append("releaseId", RELEASE_FILTER_UNTAGGED);
  }
  if (options.dateMode?.trim()) {
    params.set("dateMode", options.dateMode.trim());
  }
  if (options.from?.trim()) params.set("from", options.from.trim());
  if (options.to?.trim()) params.set("to", options.to.trim());
  const query = params.toString();
  const tasks = await ctx.fetchApi<Task[]>(
    `/boards/${encodeURIComponent(idOrSlug)}/tasks${query ? `?${query}` : ""}`,
    { port },
  );
  ctx.printJson(tasks);
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
  await runBoardsAdd({
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
  await runBoardsUpdate({
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
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runBoardsDelete({ port, board: idOrSlug });
}

export async function handleBoardsRestore(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runBoardsRestore({ port, board: idOrSlug });
}

export async function handleBoardsPurge(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runBoardsPurge({ port, board: idOrSlug });
}

export async function handleBoardsGroups(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string; json?: string; file?: string; stdin?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runBoardsGroups({
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
  options: { port?: string; json?: string; file?: string; stdin?: boolean },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runBoardsPriorities({
    port,
    board: idOrSlug,
    json: options.json,
    file: options.file,
    stdin: options.stdin,
  });
}
