#!/usr/bin/env bun

import { Command } from "commander";
import type {
  Board,
  BoardIndexEntry,
  SearchHit,
  Status,
  Task,
} from "../shared/models";
import { fetchApi } from "./lib/api-client";
import { setRuntimeCliClientName } from "./lib/clientIdentity";
import { resolveDataDir, resolvePort } from "./lib/config";
import {
  CliError,
  exitWithError,
  printJson,
  printSearchTable,
} from "./lib/output";
import { readServerStatus, startServer } from "./lib/process";
import {
  runBoardsAdd,
  runBoardsDelete,
  runBoardsGroups,
  runBoardsPriorities,
  runBoardsUpdate,
  runListsAdd,
  runListsDelete,
  runListsMove,
  runListsUpdate,
  runTasksAdd,
  runTasksDelete,
  runTasksMove,
  runTasksUpdate,
} from "./lib/writeCommands";

function addPortOption(command: Command): Command {
  return command
    .option("-p, --port <port>", "Port for the local TaskManager API")
    .option(
      "--client-name <name>",
      "Human-friendly client label sent with API requests (for notifications)",
    );
}

function parsePortOption(port: string | undefined): number | undefined {
  if (!port?.trim()) return undefined;

  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError("Invalid port", 2, { port });
  }

  return parsed;
}

const program = new Command();
program
  .name("hirotm")
  .description("TaskManager CLI for local app control and JSON queries")
  .option(
    "--client-name <name>",
    "Human-friendly client label sent with API requests (for notifications)",
  );

function readClientNameArg(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--client-name") {
      const next = argv[index + 1];
      return typeof next === "string" ? next : undefined;
    }
    if (current.startsWith("--client-name=")) {
      return current.slice("--client-name=".length);
    }
  }
  return undefined;
}

setRuntimeCliClientName(readClientNameArg(process.argv.slice(2)));

program
  .command("start")
  .description("Start the local TaskManager server")
  .option("-b, --background", "Run the server in the background")
  .option("-p, --port <port>", "Port for the local TaskManager API")
  .option("--data-dir <path>", "Override the task data directory")
  .action(async (options: { background?: boolean; dataDir?: string; port?: string }) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      const dataDir = resolveDataDir({ dataDir: options.dataDir });

      if (options.background) {
        const status = await startServer({ dataDir, port }, true);
        printJson(status);
        return;
      }

      // Run in production mode so the installed CLI uses a stable home data directory by default.
      await startServer({ dataDir, port }, false);
    } catch (error) {
      exitWithError(error);
    }
  });

addPortOption(
  program
    .command("status")
    .description("Show whether the local TaskManager server is running"),
).action(async (options: { port?: string }) => {
  try {
    const port = resolvePort({ port: parsePortOption(options.port) });
    const status = await readServerStatus({ port });
    printJson(status);
  } catch (error) {
    exitWithError(error);
  }
});

const boardsCommand = program
  .command("boards")
  .description("Inspect TaskManager boards");

addPortOption(
  boardsCommand.command("list").description("List all boards"),
).action(async (options: { port?: string }) => {
  try {
    const port = resolvePort({ port: parsePortOption(options.port) });
    const boards = await fetchApi<BoardIndexEntry[]>("/boards", { port });
    printJson(boards);
  } catch (error) {
    exitWithError(error);
  }
});

addPortOption(
  boardsCommand
    .command("show")
    .description("Show one board by numeric id or slug")
    .argument("<id-or-slug>", "Board id or slug"),
).action(async (idOrSlug: string, options: { port?: string }) => {
  try {
    const port = resolvePort({ port: parsePortOption(options.port) });
    const board = await fetchApi<Board>(
      `/boards/${encodeURIComponent(idOrSlug)}`,
      { port },
    );
    printJson(board);
  } catch (error) {
    exitWithError(error);
  }
});

function collectMultiValue(value: string, previous: string[] = []): string[] {
  return [
    ...previous,
    ...value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  ];
}

addPortOption(
  boardsCommand
    .command("tasks")
    .description("List filtered tasks for one board")
    .argument("<id-or-slug>", "Board id or slug")
    .option("--list <id>", "List id")
    .option("--group <id>", "Task group id")
    .option(
      "--priority <id>",
      "Task priority id (repeat or use comma-separated values)",
      collectMultiValue,
      [] as string[],
    )
    .option(
      "--status <id>",
      "Workflow status id (repeat or use comma-separated values)",
      collectMultiValue,
      [] as string[],
    )
    .option("--date-mode <mode>", "Date filter mode: opened, closed, or any")
    .option("--from <yyyy-mm-dd>", "Inclusive start date")
    .option("--to <yyyy-mm-dd>", "Inclusive end date"),
).action(
  async (
    idOrSlug: string,
    options: {
      port?: string;
      list?: string;
      group?: string;
      priority?: string[];
      status?: string[];
      dateMode?: string;
      from?: string;
      to?: string;
    },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      const params = new URLSearchParams();
      if (options.list?.trim()) params.set("listId", options.list.trim());
      if (options.group?.trim()) params.set("groupId", options.group.trim());
      for (const priority of options.priority ?? []) {
        params.append("priorityId", priority);
      }
      for (const status of options.status ?? []) {
        params.append("status", status);
      }
      if (options.dateMode?.trim()) params.set("dateMode", options.dateMode.trim());
      if (options.from?.trim()) params.set("from", options.from.trim());
      if (options.to?.trim()) params.set("to", options.to.trim());
      const query = params.toString();
      const tasks = await fetchApi<Task[]>(
        `/boards/${encodeURIComponent(idOrSlug)}/tasks${query ? `?${query}` : ""}`,
        { port },
      );
      printJson(tasks);
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  boardsCommand
    .command("add")
    .description("Create a board")
    .argument("[name]", "Board name (default from server)")
    .option("--emoji <text>", "Optional emoji before the board name")
    .option("--description <text>", "Board description")
    .option("--description-file <path>", "Read description from a UTF-8 file")
    .option("--description-stdin", "Read description from stdin until EOF"),
).action(
  async (
    name: string | undefined,
    options: {
      port?: string;
      emoji?: string;
      description?: string;
      descriptionFile?: string;
      descriptionStdin?: boolean;
    },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runBoardsAdd({
        port,
        name,
        emoji: options.emoji,
        description: options.description,
        descriptionFile: options.descriptionFile,
        descriptionStdin: options.descriptionStdin,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  boardsCommand
    .command("update")
    .description("Patch board metadata")
    .argument("<id-or-slug>", "Board id or slug")
    .option("--name <text>", "Board name")
    .option("--emoji <text>", "Optional emoji before the board name")
    .option("--clear-emoji", "Clear board emoji")
    .option("--description <text>", "Board description")
    .option("--description-file <path>", "Read description from a UTF-8 file")
    .option("--description-stdin", "Read description from stdin until EOF")
    .option("--clear-description", "Clear board description")
    .option(
      "--board-color <preset>",
      "Board color preset: stone, cyan, azure, indigo, violet, rose, amber, emerald, coral, sage",
    )
    .option("--clear-board-color", "Clear board color preset"),
).action(
  async (
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
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
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
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  boardsCommand
    .command("delete")
    .description("Delete a board")
    .argument("<id-or-slug>", "Board id or slug"),
).action(async (idOrSlug: string, options: { port?: string }) => {
  try {
    const port = resolvePort({ port: parsePortOption(options.port) });
    await runBoardsDelete({ port, board: idOrSlug });
  } catch (error) {
    exitWithError(error);
  }
});

addPortOption(
  boardsCommand
    .command("groups")
    .description("Replace board task groups from JSON")
    .argument("<id-or-slug>", "Board id or slug")
    .option("--json <text>", "JSON array or object with taskGroups")
    .option("--file <path>", "Read JSON from a UTF-8 file")
    .option("--stdin", "Read JSON from stdin until EOF"),
).action(
  async (
    idOrSlug: string,
    options: { port?: string; json?: string; file?: string; stdin?: boolean },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runBoardsGroups({
        port,
        board: idOrSlug,
        json: options.json,
        file: options.file,
        stdin: options.stdin,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  boardsCommand
    .command("priorities")
    .description("Replace board task priorities from JSON")
    .argument("<id-or-slug>", "Board id or slug")
    .option("--json <text>", "JSON array or object with taskPriorities")
    .option("--file <path>", "Read JSON from a UTF-8 file")
    .option("--stdin", "Read JSON from stdin until EOF"),
).action(
  async (
    idOrSlug: string,
    options: { port?: string; json?: string; file?: string; stdin?: boolean },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runBoardsPriorities({
        port,
        board: idOrSlug,
        json: options.json,
        file: options.file,
        stdin: options.stdin,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

const listsCommand = program
  .command("lists")
  .description("Create and manage lists on boards");

addPortOption(
  listsCommand
    .command("add")
    .description("Create a list on a board (appended to the end)")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .argument("[name]", "List name (default from server)")
    .option("--emoji <text>", "Optional emoji before the list name"),
).action(
  async (
    name: string | undefined,
    options: { port?: string; board: string; emoji?: string },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runListsAdd({
        port,
        board: options.board,
        name,
        emoji: options.emoji,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  listsCommand
    .command("update")
    .description("Patch fields on a list")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .argument("<list-id>", "Numeric list id")
    .option("--name <text>", "List name")
    .option("--color <css>", "List color (CSS)")
    .option("--clear-color", "Clear list color")
    .option("--emoji <text>", "Optional emoji before the list name")
    .option("--clear-emoji", "Clear list emoji"),
).action(
  async (
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
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
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
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  listsCommand
    .command("delete")
    .description("Delete a list")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .argument("<list-id>", "Numeric list id"),
).action(
  async (
    listId: string,
    options: { port?: string; board: string },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runListsDelete({
        port,
        board: options.board,
        listId,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  listsCommand
    .command("move")
    .description("Move a list with server-owned relative placement")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .argument("<list-id>", "Numeric list id")
    .option("--before <list-id>", "Place before another list")
    .option("--after <list-id>", "Place after another list")
    .option("--first", "Move to the first position")
    .option("--last", "Move to the last position"),
).action(
  async (
    listId: string,
    options: {
      port?: string;
      board: string;
      before?: string;
      after?: string;
      first?: boolean;
      last?: boolean;
    },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runListsMove({
        port,
        board: options.board,
        listId,
        before: options.before,
        after: options.after,
        first: options.first,
        last: options.last,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

const tasksCommand = program
  .command("tasks")
  .description("Create and update tasks on boards");

addPortOption(
  tasksCommand
    .command("add")
    .description("Create a task")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .requiredOption("--list <id>", "Destination list id")
    .requiredOption("--group <id>", "Task group id")
    .option("--title <text>", 'Title (default "Untitled")')
    .option("--status <id>", "Workflow status id (default open)")
    .option("--priority <id>", "Task priority id for this board")
    .option("--no-priority", "Store task with no priority")
    .option("--emoji <text>", "Optional emoji before the title")
    .option("--clear-emoji", "Clear task emoji")
    .option("--body <text>", "Task body (Markdown)")
    .option("--body-file <path>", "Read body from a UTF-8 file")
    .option("--body-stdin", "Read body from stdin until EOF"),
).action(
  async (options: {
    port?: string;
    board: string;
    list: string;
    group: string;
    title?: string;
    status?: string;
    priority?: string;
    noPriority?: boolean;
    emoji?: string;
    clearEmoji?: boolean;
    body?: string;
    bodyFile?: string;
    bodyStdin?: boolean;
  }) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runTasksAdd({
        port,
        board: options.board,
        list: options.list,
        group: options.group,
        title: options.title,
        status: options.status,
        priority: options.priority,
        noPriority: options.noPriority,
        emoji: options.emoji,
        clearEmoji: options.clearEmoji,
        body: options.body,
        bodyFile: options.bodyFile,
        bodyStdin: options.bodyStdin,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  tasksCommand
    .command("update")
    .description("Patch fields on a task")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .argument("<task-id>", "Numeric task id")
    .option("--title <text>", "Task title")
    .option("--body <text>", "Task body (Markdown)")
    .option("--body-file <path>", "Read body from a UTF-8 file")
    .option("--body-stdin", "Read body from stdin until EOF")
    .option("--status <id>", "Workflow status id")
    .option("--list <id>", "List id")
    .option("--group <id>", "Task group id")
    .option("--priority <id>", "Task priority id")
    .option("--no-priority", "Clear priority")
    .option("--color <css>", "Card color (CSS)")
    .option("--clear-color", "Clear card color")
    .option("--emoji <text>", "Emoji before the title")
    .option("--clear-emoji", "Clear emoji"),
).action(
  async (
    taskId: string,
    options: {
      port?: string;
      board: string;
      title?: string;
      body?: string;
      bodyFile?: string;
      bodyStdin?: boolean;
      status?: string;
      list?: string;
      group?: string;
      priority?: string;
      noPriority?: boolean;
      color?: string;
      clearColor?: boolean;
      emoji?: string;
      clearEmoji?: boolean;
    },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runTasksUpdate({
        port,
        board: options.board,
        taskId,
        title: options.title,
        body: options.body,
        bodyFile: options.bodyFile,
        bodyStdin: options.bodyStdin,
        status: options.status,
        list: options.list,
        group: options.group,
        priority: options.priority,
        noPriority: options.noPriority,
        color: options.color,
        clearColor: options.clearColor,
        emoji: options.emoji,
        clearEmoji: options.clearEmoji,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  tasksCommand
    .command("delete")
    .description("Delete a task")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .argument("<task-id>", "Numeric task id"),
).action(
  async (
    taskId: string,
    options: { port?: string; board: string },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runTasksDelete({
        port,
        board: options.board,
        taskId,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

addPortOption(
  tasksCommand
    .command("move")
    .description("Move a task with server-owned relative placement")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .requiredOption("--to-list <id>", "Destination list id")
    .argument("<task-id>", "Numeric task id")
    .option(
      "--to-status <id>",
      "Workflow status in the destination (default: keep current)",
    )
    .option("--before-task <id>", "Place before another task in the destination band")
    .option("--after-task <id>", "Place after another task in the destination band")
    .option("--first", "Move to the first position in the destination band")
    .option("--last", "Move to the last position in the destination band"),
).action(
  async (
    taskId: string,
    options: {
      port?: string;
      board: string;
      toList: string;
      toStatus?: string;
      beforeTask?: string;
      afterTask?: string;
      first?: boolean;
      last?: boolean;
    },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runTasksMove({
        port,
        board: options.board,
        taskId,
        toList: options.toList,
        toStatus: options.toStatus,
        beforeTask: options.beforeTask,
        afterTask: options.afterTask,
        first: options.first,
        last: options.last,
      });
    } catch (error) {
      exitWithError(error);
    }
  },
);

const statusesCommand = program
  .command("statuses")
  .description("Inspect workflow statuses");

addPortOption(
  statusesCommand.command("list").description("List all statuses"),
).action(async (options: { port?: string }) => {
  try {
    const port = resolvePort({ port: parsePortOption(options.port) });
    const statuses = await fetchApi<Status[]>("/statuses", { port });
    printJson(statuses);
  } catch (error) {
    exitWithError(error);
  }
});

function parseLimitOption(limit: string | undefined): number {
  if (limit == null || limit === "") return 20;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError("Invalid limit", 2, { limit });
  }
  return Math.min(50, n);
}

addPortOption(
  program
    .command("search")
    .description(
      "Search tasks (title, body, list name, group & status labels) via FTS5",
    )
    .argument("<query...>", "Search query (quote phrases with spaces)")
    .option("--board <id-or-slug>", "Limit results to one board")
    .option("--limit <n>", "Max results (default 20, max 50)")
    .option(
      "--format <fmt>",
      "Output format: json (default) or table",
      "json",
    )
    .option(
      "--no-prefix",
      "Do not add * to the last token (exact token only). Default matches prefixes (drag finds dragging); this flag does not",
    ),
).action(
  async (
    queryParts: string[],
    options: {
      port?: string;
      board?: string;
      limit?: string;
      format?: string;
      noPrefix?: boolean;
    },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      const q = queryParts.join(" ").trim();
      if (!q) {
        throw new CliError("Query required", 2);
      }
      const limit = parseLimitOption(options.limit);
      const fmt = (options.format ?? "json").toLowerCase();
      if (fmt !== "json" && fmt !== "table") {
        throw new CliError("Invalid --format (use json or table)", 2, {
          format: options.format,
        });
      }
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("limit", String(limit));
      if (options.board?.trim()) {
        params.set("board", options.board.trim());
      }
      if (options.noPrefix) {
        params.set("prefix", "0");
      }
      const hits = await fetchApi<SearchHit[]>(
        `/search?${params.toString()}`,
        { port },
      );
      if (fmt === "table") {
        printSearchTable(hits);
      } else {
        printJson(hits);
      }
    } catch (error) {
      exitWithError(error);
    }
  },
);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  exitWithError(error);
}
