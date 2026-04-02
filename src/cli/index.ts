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
