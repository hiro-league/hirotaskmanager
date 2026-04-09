import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import {
  handleReleasesAdd,
  handleReleasesDelete,
  handleReleasesList,
  handleReleasesShow,
  handleReleasesUpdate,
} from "../handlers/releases";
import { addPortOption, withCliErrors } from "../lib/command-helpers";

export function registerReleaseCommands(
  program: Command,
  ctx: CliContext,
): void {
  const releasesCommand = program
    .command("releases")
    .description(
      "List and manage board releases (writes require manageStructure on the board)",
    );

  addPortOption(
    releasesCommand
      .command("list")
      .description("List releases for a board")
      .requiredOption("--board <id-or-slug>", "Board id or slug"),
  ).action(async (options: { port?: string; board: string }) => {
    await withCliErrors(() => handleReleasesList(ctx, options));
  });

  addPortOption(
    releasesCommand
      .command("show")
      .description("Show one release by id")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("<release-id>", "Numeric release id"),
  ).action(
    async (releaseId: string, options: { port?: string; board: string }) => {
      await withCliErrors(() => handleReleasesShow(ctx, releaseId, options));
    },
  );

  addPortOption(
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
    async (options: {
      port?: string;
      board: string;
      name: string;
      color?: string;
      clearColor?: boolean;
      releaseDate?: string;
      clearReleaseDate?: boolean;
    }) => {
      await withCliErrors(() => handleReleasesAdd(ctx, options));
    },
  );

  addPortOption(
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
    async (
      releaseId: string,
      options: {
        port?: string;
        board: string;
        name?: string;
        color?: string;
        clearColor?: boolean;
        releaseDate?: string;
        clearReleaseDate?: boolean;
      },
    ) => {
      await withCliErrors(() => handleReleasesUpdate(ctx, releaseId, options));
    },
  );

  addPortOption(
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
  ).action(
    async (
      releaseId: string,
      options: { port?: string; board: string; moveTasksTo?: string },
    ) => {
      await withCliErrors(() => handleReleasesDelete(ctx, releaseId, options));
    },
  );
}
