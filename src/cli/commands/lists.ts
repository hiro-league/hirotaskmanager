import { Command } from "commander";
import type { CliContext } from "../types/context";
import {
  handleListsAdd,
  handleListsDelete,
  handleListsList,
  handleListsMove,
  handleListsPurge,
  handleListsRestore,
  handleListsUpdate,
} from "../handlers/lists";
import {
  addClientNameOption,
  addYesOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/command-helpers";
import { CLI_DEFAULTS } from "../lib/constants";

export function registerListCommands(
  program: Command,
  ctx: CliContext,
): void {
  const listsCommand = program
    .command("lists")
    .description("List and manage lists (columns) on boards");

  addClientNameOption(
    listsCommand
      .command("list")
      .description("List lists on a board (readBoard policy)")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .option("--limit <n>", "Page size (omit for one full response)")
      .option("--offset <n>", "Skip this many lists (default 0)")
      .option(
        "--page-all",
        `Merge all pages (uses --limit or ${CLI_DEFAULTS.MAX_PAGE_LIMIT} per request)`,
      )
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    cliAction((options: {
      board: string;
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      fields?: string;
    }) => handleListsList(ctx, options)),
  );

  addClientNameOption(
    listsCommand
      .command("add")
      .description("Create a list on a board (appended to the end)")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("[name]", "List name (default from server)")
      .option("--emoji <text>", "Optional emoji before the list name"),
  ).action(
    cliAction(
      (
        name: string | undefined,
        options: { board: string; emoji?: string },
      ) => handleListsAdd(ctx, name, options),
    ),
  );

  addClientNameOption(
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
    cliAction(
      (
        listId: string,
        options: {
          board: string;
          name?: string;
          color?: string;
          clearColor?: boolean;
          emoji?: string;
          clearEmoji?: boolean;
        },
      ) => handleListsUpdate(ctx, listId, options),
    ),
  );

  addClientNameOption(
    addYesOption(
      listsCommand
        .command("delete")
        .description(
          "Move a list to Trash (lists restore / purge use the list id only)",
        )
        .requiredOption("--board <id-or-slug>", "Board id or slug")
        .argument("<list-id>", "Numeric list id"),
    ),
  ).action(
    cliAction(
      (
        listId: string,
        options: { board: string; yes?: boolean },
      ) => handleListsDelete(ctx, listId, options),
    ),
  );

  addClientNameOption(
    addYesOption(
      listsCommand
        .command("restore")
        .description("Restore a list from Trash (board must be active)")
        .argument("<list-id>", "Numeric list id (see: hirotm trash list lists)"),
    ),
  ).action(
    cliAction((listId: string, options: { yes?: boolean }) =>
      handleListsRestore(ctx, listId, options),
    ),
  );

  addClientNameOption(
    addYesOption(
      listsCommand
        .command("purge")
        .description("Permanently delete a list from Trash (cannot be undone)")
        .argument("<list-id>", "Numeric list id"),
    ),
  ).action(
    cliAction((listId: string, options: { yes?: boolean }) =>
      handleListsPurge(ctx, listId, options),
    ),
  );

  addClientNameOption(
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
    cliAction(
      (
        listId: string,
        options: {
          board: string;
          before?: string;
          after?: string;
          first?: boolean;
          last?: boolean;
        },
      ) => handleListsMove(ctx, listId, options),
    ),
  );
}
