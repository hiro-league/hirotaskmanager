import { Command } from "commander";
import type { CliContext } from "../types/context";
import {
  handleTrashBoards,
  handleTrashLists,
  handleTrashTasks,
} from "../handlers/trash";
import {
  addClientNameOption,
  addCountOnlyOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/core/command-helpers";
import { CLI_DEFAULTS } from "../lib/core/constants";
import {
  HELP_AFTER_TRASH_GROUP,
  HELP_AFTER_TRASH_LIST_BOARDS,
  HELP_AFTER_TRASH_LIST_GROUP,
  HELP_AFTER_TRASH_LIST_LISTS,
  HELP_AFTER_TRASH_LIST_TASKS,
} from "../lib/core/cliCommandHelp";

export function registerTrashCommands(
  program: Command,
  ctx: CliContext,
): void {
  const trashCommand = program
    .command("trash")
    .description("Inspect Trash (same JSON shapes as GET /api/trash/...)")
    .addHelpText("after", HELP_AFTER_TRASH_GROUP);

  const listCommand = trashCommand
    .command("list")
    .description("List entities currently in Trash")
    .addHelpText("after", HELP_AFTER_TRASH_LIST_GROUP);

  addClientNameOption(
    addCountOnlyOption(
      listCommand
        .command("boards")
        .description("List boards in Trash")
        .option("--limit <n>", "Page size (omit for one full response)")
        .option("--offset <n>", "Skip this many rows (default 0)")
        .option(
          "--page-all",
          `Merge all pages (uses --limit or ${CLI_DEFAULTS.MAX_PAGE_LIMIT} per request)`,
        )
        .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
        .addHelpText("after", HELP_AFTER_TRASH_LIST_BOARDS),
    ),
  ).action(
    cliAction((options: {
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      countOnly?: boolean;
      fields?: string;
    }) => handleTrashBoards(ctx, options)),
  );

  addClientNameOption(
    addCountOnlyOption(
      listCommand
        .command("lists")
        .description("Lists in Trash (includes board name and canRestore)")
        .option("--limit <n>", "Page size (omit for one full response)")
        .option("--offset <n>", "Skip this many rows (default 0)")
        .option(
          "--page-all",
          `Merge all pages (uses --limit or ${CLI_DEFAULTS.MAX_PAGE_LIMIT} per request)`,
        )
        .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
        .addHelpText("after", HELP_AFTER_TRASH_LIST_LISTS),
    ),
  ).action(
    cliAction((options: {
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      countOnly?: boolean;
      fields?: string;
    }) => handleTrashLists(ctx, options)),
  );

  addClientNameOption(
    addCountOnlyOption(
      listCommand
        .command("tasks")
        .description("Tasks in Trash (includes board/list names and canRestore)")
        .option("--limit <n>", "Page size (omit for one full response)")
        .option("--offset <n>", "Skip this many rows (default 0)")
        .option(
          "--page-all",
          `Merge all pages (uses --limit or ${CLI_DEFAULTS.MAX_PAGE_LIMIT} per request)`,
        )
        .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
        .addHelpText("after", HELP_AFTER_TRASH_LIST_TASKS),
    ),
  ).action(
    cliAction((options: {
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      countOnly?: boolean;
      fields?: string;
    }) => handleTrashTasks(ctx, options)),
  );
}
