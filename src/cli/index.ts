#!/usr/bin/env bun

import { Command } from "commander";
import type { Board, BoardIndexEntry, SearchHit, Status } from "../shared/models";
import { fetchApi } from "./lib/api-client";
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
  runListsAdd,
  runTasksAdd,
  runTasksMove,
  runTasksUpdate,
} from "./lib/writeCommands";

function addPortOption(command: Command): Command {
  return command.option("-p, --port <port>", "Port for the local TaskManager API");
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
  .description("TaskManager CLI for local app control and JSON queries");

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

addPortOption(
  boardsCommand
    .command("add")
    .description("Create a board")
    .argument("[name]", "Board name (default from server)")
    .option("--emoji <text>", "Optional emoji before the board name"),
).action(async (name: string | undefined, options: { port?: string; emoji?: string }) => {
  try {
    const port = resolvePort({ port: parsePortOption(options.port) });
    await runBoardsAdd({ port, name, emoji: options.emoji });
  } catch (error) {
    exitWithError(error);
  }
});

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
    .command("move")
    .description("Move a task to another list (append to end of band)")
    .requiredOption("--board <id-or-slug>", "Board id or slug")
    .requiredOption("--to-list <id>", "Destination list id")
    .argument("<task-id>", "Numeric task id")
    .option(
      "--to-status <id>",
      "Workflow status in the destination (default: keep current)",
    ),
).action(
  async (
    taskId: string,
    options: { port?: string; board: string; toList: string; toStatus?: string },
  ) => {
    try {
      const port = resolvePort({ port: parsePortOption(options.port) });
      await runTasksMove({
        port,
        board: options.board,
        taskId,
        toList: options.toList,
        toStatus: options.toStatus,
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
