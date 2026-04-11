import {
  parseBoardDescribeEntities,
  type BoardDescribeResponse,
} from "../../shared/boardDescribe";
import { RELEASE_FILTER_UNTAGGED } from "../../shared/boardFilters";
import type { PaginatedListBody } from "../../shared/pagination";
import type { BoardIndexEntry, Task } from "../../shared/models";
import {
  parseOptionalListLimit,
  parseOptionalOffset,
  parsePortOption,
  requireNdjsonWhenQuiet,
  requireNdjsonWhenUsingFields,
  resolveQuietExplicitField,
} from "../lib/command-helpers";
import { confirmMutableAction } from "../lib/mutableActionConfirm";
import {
  COLUMNS_BOARDS_LIST,
  COLUMNS_TASKS_LIST,
  QUIET_DEFAULT_BOARD_INDEX,
  QUIET_DEFAULT_TASK,
} from "../lib/listTableSpecs";
import { fetchAllPages } from "../lib/paginatedFetch";
import {
  FIELDS_BOARD_INDEX,
  FIELDS_TASK,
  parseAndValidateFields,
  projectPaginatedItems,
} from "../lib/jsonFieldProjection";
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
import { CLI_ERR } from "../lib/cli-error-codes";
import { CliError, printPaginatedListRead } from "../lib/output";
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
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const fieldKeys = parseAndValidateFields(options.fields, FIELDS_BOARD_INDEX);
  requireNdjsonWhenUsingFields(fieldKeys);
  requireNdjsonWhenQuiet();
  const quietExplicit = resolveQuietExplicitField(fieldKeys);
  const limitOpt = parseOptionalListLimit(options.limit);
  const offsetOpt = parseOptionalOffset(options.offset);
  const pageAll = options.pageAll === true;
  const base = "/boards";

  if (!pageAll) {
    const q = new URLSearchParams();
    if (limitOpt != null) {
      q.set("limit", String(limitOpt));
    }
    if (offsetOpt > 0) {
      q.set("offset", String(offsetOpt));
    }
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await ctx.fetchApi<PaginatedListBody<BoardIndexEntry>>(
      `${base}${suffix}`,
      { port },
    );
    const rows = fieldKeys ? projectPaginatedItems(body, fieldKeys).items : body.items;
    printPaginatedListRead(body, rows, COLUMNS_BOARDS_LIST, {
      defaultKeys: QUIET_DEFAULT_BOARD_INDEX,
      explicitField: quietExplicit,
    });
    return;
  }

  const pageSize = limitOpt ?? 500;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return ctx.fetchApi<PaginatedListBody<BoardIndexEntry>>(
      `${base}?${q.toString()}`,
      { port },
    );
  }, pageSize);
  const mergedRows = fieldKeys
    ? projectPaginatedItems(merged, fieldKeys).items
    : merged.items;
  printPaginatedListRead(merged, mergedRows, COLUMNS_BOARDS_LIST, {
    defaultKeys: QUIET_DEFAULT_BOARD_INDEX,
    explicitField: quietExplicit,
  });
}

export async function handleBoardsDescribe(
  ctx: CliContext,
  idOrSlug: string,
  options: { port?: string; entities?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
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
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const fieldKeys = parseAndValidateFields(options.fields, FIELDS_TASK);
  requireNdjsonWhenUsingFields(fieldKeys);
  requireNdjsonWhenQuiet();
  const quietExplicit = resolveQuietExplicitField(fieldKeys);
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
  const limitOpt = parseOptionalListLimit(options.limit);
  const offsetOpt = parseOptionalOffset(options.offset);
  const pageAll = options.pageAll === true;
  const base = `/boards/${encodeURIComponent(idOrSlug)}/tasks`;

  if (!pageAll) {
    const q = new URLSearchParams(params);
    if (limitOpt != null) {
      q.set("limit", String(limitOpt));
    }
    if (offsetOpt > 0) {
      q.set("offset", String(offsetOpt));
    }
    const body = await ctx.fetchApi<PaginatedListBody<Task>>(
      `${base}?${q.toString()}`,
      { port },
    );
    const rows = fieldKeys ? projectPaginatedItems(body, fieldKeys).items : body.items;
    printPaginatedListRead(body, rows, COLUMNS_TASKS_LIST, {
      defaultKeys: QUIET_DEFAULT_TASK,
      explicitField: quietExplicit,
    });
    return;
  }

  const pageSize = limitOpt ?? 500;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams(params);
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return ctx.fetchApi<PaginatedListBody<Task>>(
      `${base}?${q.toString()}`,
      { port },
    );
  }, pageSize);
  const mergedRows = fieldKeys
    ? projectPaginatedItems(merged, fieldKeys).items
    : merged.items;
  printPaginatedListRead(merged, mergedRows, COLUMNS_TASKS_LIST, {
    defaultKeys: QUIET_DEFAULT_TASK,
    explicitField: quietExplicit,
  });
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
  await runBoardsDelete({ port, board: idOrSlug });
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
  await runBoardsRestore({ port, board: idOrSlug });
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
  await runBoardsPurge({ port, board: idOrSlug });
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
  await runBoardsPriorities({
    port,
    board: idOrSlug,
    json: options.json,
    file: options.file,
    stdin: options.stdin,
  });
}
