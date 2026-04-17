import { Command } from "commander";
import type { CliContext } from "../types/context";
import {
  handleListsAdd,
  handleListsDelete,
  handleListsList,
  handleListsMove,
  handleListsPurge,
  handleListsRestore,
  handleListsShow,
  handleListsUpdate,
} from "../handlers/lists";
import {
  addClientNameOption,
  addCountOnlyOption,
  addDryRunOption,
  addYesOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/core/command-helpers";
import { CLI_DEFAULTS } from "../lib/core/constants";
import {
  HELP_AFTER_LISTS_ADD,
  HELP_AFTER_LISTS_DELETE,
  HELP_AFTER_LISTS_GROUP,
  HELP_AFTER_LISTS_LIST,
  HELP_AFTER_LISTS_MOVE,
  HELP_AFTER_LISTS_PURGE,
  HELP_AFTER_LISTS_RESTORE,
  HELP_AFTER_LISTS_SHOW,
  HELP_AFTER_LISTS_UPDATE,
} from "../lib/core/cliCommandHelp";

export function registerListCommands(
  program: Command,
  ctx: CliContext,
): void {
  const listsCommand = program
    .command("lists")
    .description("List, show, and manage lists (columns) on boards")
    .addHelpText("after", HELP_AFTER_LISTS_GROUP);

  addClientNameOption(
    addCountOnlyOption(
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
        .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
        .addHelpText("after", HELP_AFTER_LISTS_LIST),
    ),
  ).action(
    cliAction((options: {
      board: string;
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      countOnly?: boolean;
      fields?: string;
    }) => handleListsList(ctx, options)),
  );

  addClientNameOption(
    listsCommand
      .command("show")
      .description("Show one list by global id")
      .argument("<list-id>", "Numeric list id")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
      .addHelpText("after", HELP_AFTER_LISTS_SHOW),
  ).action(
    cliAction((listId: string, options: { fields?: string }) =>
      handleListsShow(ctx, listId, options)),
  );

  addClientNameOption(
    listsCommand
      .command("add")
      .description("Create a list on a board (appended to the end)")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("[name]", "List name (default from server)")
      .option("--emoji <text>", "Optional emoji before the list name")
      .addHelpText("after", HELP_AFTER_LISTS_ADD),
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
      .argument("<list-id>", "Numeric list id")
      .option("--name <text>", "List name")
      .option("--color <css>", "List color (CSS)")
      .option("--clear-color", "Clear list color")
      .option("--emoji <text>", "Optional emoji before the list name")
      .option("--clear-emoji", "Clear list emoji")
      .addHelpText("after", HELP_AFTER_LISTS_UPDATE),
  ).action(
    cliAction(
      (
        listId: string,
        options: {
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
    addDryRunOption(
      addYesOption(
        listsCommand
          .command("delete")
          .description(
            "Move a list to Trash (lists restore / purge use the list id only)",
          )
          .argument("<list-id>", "Numeric list id")
          .addHelpText("after", HELP_AFTER_LISTS_DELETE),
      ),
    ),
  ).action(
    cliAction(
      (
        listId: string,
        options: { yes?: boolean; dryRun?: boolean },
      ) => handleListsDelete(ctx, listId, options),
    ),
  );

  addClientNameOption(
    addYesOption(
      listsCommand
        .command("restore")
        .description("Restore a list from Trash (board must be active)")
        .argument("<list-id>", "Numeric list id (see: hirotm trash list lists)")
        .addHelpText("after", HELP_AFTER_LISTS_RESTORE),
    ),
  ).action(
    cliAction((listId: string, options: { yes?: boolean }) =>
      handleListsRestore(ctx, listId, options),
    ),
  );

  addClientNameOption(
    addDryRunOption(
      addYesOption(
        listsCommand
          .command("purge")
          .description(
            "Permanently delete a list from Trash (cannot be undone)",
          )
          .argument("<list-id>", "Numeric list id")
          .addHelpText("after", HELP_AFTER_LISTS_PURGE),
      ),
    ),
  ).action(
    cliAction(
      (listId: string, options: { yes?: boolean; dryRun?: boolean }) =>
        handleListsPurge(ctx, listId, options),
    ),
  );

  addClientNameOption(
    listsCommand
      .command("move")
      .description("Move a list with server-owned relative placement")
      .argument("<list-id>", "Numeric list id")
      .option("--before <list-id>", "Place before another list")
      .option("--after <list-id>", "Place after another list")
      .option("--first", "Move to the first position")
      .option("--last", "Move to the last position")
      .addHelpText("after", HELP_AFTER_LISTS_MOVE),
  ).action(
    cliAction(
      (
        listId: string,
        options: {
          before?: string;
          after?: string;
          first?: boolean;
          last?: boolean;
        },
      ) => handleListsMove(ctx, listId, options),
    ),
  );
}
