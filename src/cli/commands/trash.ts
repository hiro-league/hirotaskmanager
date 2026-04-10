import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import {
  handleTrashBoards,
  handleTrashLists,
  handleTrashTasks,
} from "../handlers/trash";
import {
  addPortOption,
  CLI_FIELDS_OPTION_DESC,
  withCliErrors,
} from "../lib/command-helpers";

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

  addPortOption(
    listCommand
      .command("boards")
      .description("List boards in Trash")
      .option("--limit <n>", "Page size (omit for one full response)")
      .option("--offset <n>", "Skip this many rows (default 0)")
      .option("--page-all", "Merge all pages (uses --limit or 500 per request)")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    async (options: {
      port?: string;
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      fields?: string;
    }) => {
      await withCliErrors(() => handleTrashBoards(ctx, options));
    },
  );

  addPortOption(
    listCommand
      .command("lists")
      .description("Lists in Trash (includes board name and canRestore)")
      .option("--limit <n>", "Page size (omit for one full response)")
      .option("--offset <n>", "Skip this many rows (default 0)")
      .option("--page-all", "Merge all pages (uses --limit or 500 per request)")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    async (options: {
      port?: string;
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      fields?: string;
    }) => {
      await withCliErrors(() => handleTrashLists(ctx, options));
    },
  );

  addPortOption(
    listCommand
      .command("tasks")
      .description("Tasks in Trash (includes board/list names and canRestore)")
      .option("--limit <n>", "Page size (omit for one full response)")
      .option("--offset <n>", "Skip this many rows (default 0)")
      .option("--page-all", "Merge all pages (uses --limit or 500 per request)")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    async (options: {
      port?: string;
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      fields?: string;
    }) => {
      await withCliErrors(() => handleTrashTasks(ctx, options));
    },
  );
}
