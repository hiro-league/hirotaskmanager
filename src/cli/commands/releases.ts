import { Command } from "commander";
import type { CliContext } from "../types/context";
import {
  handleReleasesAdd,
  handleReleasesDelete,
  handleReleasesList,
  handleReleasesSetDefault,
  handleReleasesShow,
  handleReleasesUpdate,
} from "../handlers/releases";
import {
  addClientNameOption,
  addYesOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/command-helpers";
import { CLI_DEFAULTS } from "../lib/constants";

export function registerReleaseCommands(
  program: Command,
  ctx: CliContext,
): void {
  const releasesCommand = program
    .command("releases")
    .description(
      "List and manage board releases (writes require manageStructure on the board)",
    );

  addClientNameOption(
    releasesCommand
      .command("list")
      .description("List releases for a board")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .option("--limit <n>", "Page size (omit for one full response)")
      .option("--offset <n>", "Skip this many releases (default 0)")
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
    }) => handleReleasesList(ctx, options)),
  );

  addClientNameOption(
    releasesCommand
      .command("show")
      .description("Show one release by id")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("<release-id>", "Numeric release id")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    cliAction(
      (
        releaseId: string,
        options: { board: string; fields?: string },
      ) => handleReleasesShow(ctx, releaseId, options),
    ),
  );

  addClientNameOption(
    releasesCommand
      .command("add")
      .description("Create a release on a board")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .requiredOption("--name <text>", "Release name (unique per board)")
      .option("--color <css>", "Optional release color (CSS)")
      .option("--clear-color", "Store release with no color")
      .option("--release-date <text>", "Optional date label (e.g. YYYY-MM-DD)")
      .option("--clear-release-date", "Clear release date"),
  ).action(
    cliAction((options: {
      board: string;
      name: string;
      color?: string;
      clearColor?: boolean;
      releaseDate?: string;
      clearReleaseDate?: boolean;
    }) => handleReleasesAdd(ctx, options)),
  );

  addClientNameOption(
    releasesCommand
      .command("set-default")
      .description(
        "Set or clear the board default release (PATCH board; requires manageStructure)",
      )
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .option("--clear", "Clear the board default release")
      .argument(
        "[release-id]",
        "Numeric release id to use as default (omit when using --clear)",
      ),
  ).action(
    cliAction(
      (
        releaseId: string | undefined,
        options: { board: string; clear?: boolean },
      ) => handleReleasesSetDefault(ctx, releaseId, options),
    ),
  );

  addClientNameOption(
    releasesCommand
      .command("update")
      .description("Patch a release")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("<release-id>", "Numeric release id")
      .option("--name <text>", "New name")
      .option("--color <css>", "Release color (CSS)")
      .option("--clear-color", "Clear color")
      .option("--release-date <text>", "Release date")
      .option("--clear-release-date", "Clear release date"),
  ).action(
    cliAction(
      (
        releaseId: string,
        options: {
          board: string;
          name?: string;
          color?: string;
          clearColor?: boolean;
          releaseDate?: string;
          clearReleaseDate?: boolean;
        },
      ) => handleReleasesUpdate(ctx, releaseId, options),
    ),
  );

  addClientNameOption(
    addYesOption(
      releasesCommand
        .command("delete")
        .description(
          "Delete a release (tasks become untagged unless --move-tasks-to targets another release)",
        )
        .requiredOption("--board <id-or-slug>", "Board id or slug")
        .argument("<release-id>", "Numeric release id")
        .option(
          "--move-tasks-to <id>",
          "Move tasks on this release to another release before delete",
        ),
    ),
  ).action(
    cliAction(
      (
        releaseId: string,
        options: {
          board: string;
          moveTasksTo?: string;
          yes?: boolean;
        },
      ) => handleReleasesDelete(ctx, releaseId, options),
    ),
  );
}
