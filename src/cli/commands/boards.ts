import { Command } from "commander";
import type { CliContext } from "../types/context";
import {
  handleBoardsAdd,
  handleBoardsDelete,
  handleBoardsGroups,
  handleBoardsList,
  handleBoardsPriorities,
  handleBoardsPurge,
  handleBoardsRestore,
  handleBoardsDescribe,
  handleBoardsUpdate,
} from "../handlers/boards";
import {
  addClientNameOption,
  addCountOnlyOption,
  addDryRunOption,
  addYesOption,
  CLI_BOARD_DESCRIBE_ENTITIES_DESC,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/core/command-helpers";
import { CLI_DEFAULTS } from "../lib/core/constants";
import {
  HELP_AFTER_BOARDS_ADD,
  HELP_AFTER_BOARDS_CONFIGURE_GROUP,
  HELP_AFTER_BOARDS_CONFIGURE_GROUPS,
  HELP_AFTER_BOARDS_CONFIGURE_PRIORITIES,
  HELP_AFTER_BOARDS_DELETE,
  HELP_AFTER_BOARDS_DESCRIBE,
  HELP_AFTER_BOARDS_GROUP,
  HELP_AFTER_BOARDS_LIST,
  HELP_AFTER_BOARDS_PURGE,
  HELP_AFTER_BOARDS_RESTORE,
  HELP_AFTER_BOARDS_UPDATE,
} from "../lib/core/cliCommandHelp";

export function registerBoardCommands(
  program: Command,
  ctx: CliContext,
): void {
  const boardsCommand = program
    .command("boards")
    .description("Inspect TaskManager boards")
    .addHelpText("after", HELP_AFTER_BOARDS_GROUP);

  addClientNameOption(
    addCountOnlyOption(
      boardsCommand
        .command("list")
        .description(
          "List all boards (default: global --format ndjson; use --format human for a table)",
        )
        .option(
          "--limit <n>",
          "Page size (omit to return all boards in one response)",
        )
        .option("--offset <n>", "Skip this many boards (default 0)")
        .option(
          "--page-all",
          `Fetch every page with --limit (or ${CLI_DEFAULTS.MAX_PAGE_LIMIT}) and merge into one result set`,
        )
        .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
        .addHelpText("after", HELP_AFTER_BOARDS_LIST),
    ),
  ).action(
    cliAction((options: {
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      countOnly?: boolean;
      fields?: string;
    }) => handleBoardsList(ctx, options)),
  );

  addClientNameOption(
    boardsCommand
      .command("describe")
      .description(
        "Probe board structure (lists, groups, priorities, releases, statuses, policy) without tasks",
      )
      .argument("<id-or-slug>", "Board id or slug")
      .option("--entities <csv>", CLI_BOARD_DESCRIBE_ENTITIES_DESC)
      .addHelpText("after", HELP_AFTER_BOARDS_DESCRIBE),
  ).action(
    cliAction(
      (
        idOrSlug: string,
        options: { entities?: string },
      ) => handleBoardsDescribe(ctx, idOrSlug, options),
    ),
  );

  addClientNameOption(
    boardsCommand
      .command("add")
      .description("Create a board")
      .argument("[name]", "Board name (default from server)")
      .option("--emoji <text>", "Optional emoji before the board name")
      .option("--description <text>", "Board description")
      .option("--description-file <path>", "Read description from a UTF-8 file")
      .option("--description-stdin", "Read description from stdin until EOF")
      .addHelpText("after", HELP_AFTER_BOARDS_ADD),
  ).action(
    cliAction(
      (
        name: string | undefined,
        options: {
          emoji?: string;
          description?: string;
          descriptionFile?: string;
          descriptionStdin?: boolean;
        },
      ) => handleBoardsAdd(ctx, name, options),
    ),
  );

  addClientNameOption(
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
      .option("--clear-board-color", "Clear board color preset")
      .addHelpText("after", HELP_AFTER_BOARDS_UPDATE),
  ).action(
    cliAction(
      (
        idOrSlug: string,
        options: {
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
      ) => handleBoardsUpdate(ctx, idOrSlug, options),
    ),
  );

  addClientNameOption(
    addDryRunOption(
      addYesOption(
        boardsCommand
          .command("delete")
          .description(
            "Move a board to Trash (same as the app; restore or purge from Trash)",
          )
          .argument("<id-or-slug>", "Board id or slug")
          .addHelpText("after", HELP_AFTER_BOARDS_DELETE),
      ),
    ),
  ).action(
    cliAction(
      (idOrSlug: string, options: { yes?: boolean; dryRun?: boolean }) =>
        handleBoardsDelete(ctx, idOrSlug, options),
    ),
  );

  addClientNameOption(
    addYesOption(
      boardsCommand
        .command("restore")
        .description("Restore a board from Trash to the active board list")
        .argument(
          "<id-or-slug>",
          "Trashed board numeric id, or slug from Trash",
        )
        .addHelpText("after", HELP_AFTER_BOARDS_RESTORE),
    ),
  ).action(
    cliAction((idOrSlug: string, options: { yes?: boolean }) =>
      handleBoardsRestore(ctx, idOrSlug, options),
    ),
  );

  addClientNameOption(
    addDryRunOption(
      addYesOption(
        boardsCommand
          .command("purge")
          .description(
            "Permanently delete a board from Trash (cannot be undone)",
          )
          .argument(
            "<id-or-slug>",
            "Trashed board numeric id, or slug from Trash",
          )
          .addHelpText("after", HELP_AFTER_BOARDS_PURGE),
      ),
    ),
  ).action(
    cliAction(
      (idOrSlug: string, options: { yes?: boolean; dryRun?: boolean }) =>
        handleBoardsPurge(ctx, idOrSlug, options),
    ),
  );

  const configure = boardsCommand
    .command("configure")
    .description("Replace-style board structure from JSON")
    .addHelpText("after", HELP_AFTER_BOARDS_CONFIGURE_GROUP);

  addClientNameOption(
    addDryRunOption(
      addYesOption(
        configure
          .command("groups")
          .description(
            "Set board task groups (explicit creates, updates, deletes, defaults)",
          )
          .argument("<id-or-slug>", "Board id or slug")
          .option(
            "--json <text>",
            "JSON",
          )
          .option("--file <path>", "Read JSON from a UTF-8 file")
          .option("--stdin", "Read JSON from stdin until EOF")
          .addHelpText("after", HELP_AFTER_BOARDS_CONFIGURE_GROUPS),
      ),
    ),
  ).action(
    cliAction(
      (
        idOrSlug: string,
        options: {
          json?: string;
          file?: string;
          stdin?: boolean;
          yes?: boolean;
          dryRun?: boolean;
        },
      ) => handleBoardsGroups(ctx, idOrSlug, options),
    ),
  );

  addClientNameOption(
    addDryRunOption(
      addYesOption(
        configure
          .command("priorities")
          .description("Replace board task priorities from JSON")
          .argument("<id-or-slug>", "Board id or slug")
          .option("--json <text>", "JSON array or object with taskPriorities")
          .option("--file <path>", "Read JSON from a UTF-8 file")
          .option("--stdin", "Read JSON from stdin until EOF")
          .addHelpText("after", HELP_AFTER_BOARDS_CONFIGURE_PRIORITIES),
      ),
    ),
  ).action(
    cliAction(
      (
        idOrSlug: string,
        options: {
          json?: string;
          file?: string;
          stdin?: boolean;
          yes?: boolean;
          dryRun?: boolean;
        },
      ) => handleBoardsPriorities(ctx, idOrSlug, options),
    ),
  );
}
