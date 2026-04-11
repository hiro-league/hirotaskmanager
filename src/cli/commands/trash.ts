import { Command } from "commander";
import type { CliContext } from "../types/context";
import {
  handleTrashBoards,
  handleTrashLists,
  handleTrashTasks,
} from "../handlers/trash";
import {
  addClientNameOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/command-helpers";
import { CLI_DEFAULTS } from "../lib/constants";

export function registerTrashCommands(
  program: Command,
  ctx: CliContext,
): void {
  const trashCommand = program
    .command("trash")
    .description("Inspect Trash (same JSON shapes as GET /api/trash/...)");

  const listCommand = trashCommand
    .command("list")
    .description("List entities currently in Trash");

  addClientNameOption(
    listCommand
      .command("boards")
      .description("List boards in Trash")
      .option("--limit <n>", "Page size (omit for one full response)")
      .option("--offset <n>", "Skip this many rows (default 0)")
      .option(
        "--page-all",
        `Merge all pages (uses --limit or ${CLI_DEFAULTS.MAX_PAGE_LIMIT} per request)`,
      )
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    cliAction((options: {
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      fields?: string;
    }) => handleTrashBoards(ctx, options)),
  );

  addClientNameOption(
    listCommand
      .command("lists")
      .description("Lists in Trash (includes board name and canRestore)")
      .option("--limit <n>", "Page size (omit for one full response)")
      .option("--offset <n>", "Skip this many rows (default 0)")
      .option(
        "--page-all",
        `Merge all pages (uses --limit or ${CLI_DEFAULTS.MAX_PAGE_LIMIT} per request)`,
      )
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    cliAction((options: {
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      fields?: string;
    }) => handleTrashLists(ctx, options)),
  );

  addClientNameOption(
    listCommand
      .command("tasks")
      .description("Tasks in Trash (includes board/list names and canRestore)")
      .option("--limit <n>", "Page size (omit for one full response)")
      .option("--offset <n>", "Skip this many rows (default 0)")
      .option(
        "--page-all",
        `Merge all pages (uses --limit or ${CLI_DEFAULTS.MAX_PAGE_LIMIT} per request)`,
      )
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    cliAction((options: {
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      fields?: string;
    }) => handleTrashTasks(ctx, options)),
  );
}
