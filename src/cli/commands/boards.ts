import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import {
  handleBoardsAdd,
  handleBoardsDelete,
  handleBoardsGroups,
  handleBoardsList,
  handleBoardsPriorities,
  handleBoardsPurge,
  handleBoardsRestore,
  handleBoardsShow,
  handleBoardsTasks,
  handleBoardsUpdate,
} from "../handlers/boards";
import {
  addPortOption,
  collectMultiValue,
  withCliErrors,
} from "../lib/command-helpers";

export function registerBoardCommands(
  program: Command,
  ctx: CliContext,
): void {
  const boardsCommand = program
    .command("boards")
    .description("Inspect TaskManager boards");

  addPortOption(
    boardsCommand.command("list").description("List all boards"),
  ).action(async (options: { port?: string }) => {
    await withCliErrors(() => handleBoardsList(ctx, options));
  });

  addPortOption(
    boardsCommand
      .command("show")
      .description("Show one board by numeric id or slug")
      .argument("<id-or-slug>", "Board id or slug"),
  ).action(async (idOrSlug: string, options: { port?: string }) => {
    await withCliErrors(() => handleBoardsShow(ctx, idOrSlug, options));
  });

  addPortOption(
    boardsCommand
      .command("tasks")
      .description("List filtered tasks for one board")
      .argument("<id-or-slug>", "Board id or slug")
      .option("--list <id>", "List id")
      .option(
        "--group <id>",
        "Task group id (repeat or use comma-separated values)",
        collectMultiValue,
        [] as string[],
      )
      .option(
        "--priority <id>",
        "Task priority id (repeat or use comma-separated values)",
        collectMultiValue,
        [] as string[],
      )
      .option(
        "--status <id>",
        "Workflow status id (repeat or use comma-separated values)",
        collectMultiValue,
        [] as string[],
      )
      .option(
        "--release-id <id>",
        "Release id filter (repeat or comma-separated; OR with other release filters)",
        collectMultiValue,
        [] as string[],
      )
      .option(
        "--untagged",
        "Include tasks with no release (OR with --release-id when both are used)",
      )
      .option("--date-mode <mode>", "Date filter mode: opened, closed, or any")
      .option("--from <yyyy-mm-dd>", "Inclusive start date")
      .option("--to <yyyy-mm-dd>", "Inclusive end date"),
  ).action(
    async (
      idOrSlug: string,
      options: {
        port?: string;
        list?: string;
        group?: string[];
        priority?: string[];
        status?: string[];
        releaseId?: string[];
        untagged?: boolean;
        dateMode?: string;
        from?: string;
        to?: string;
      },
    ) => {
      await withCliErrors(() => handleBoardsTasks(ctx, idOrSlug, options));
    },
  );

  addPortOption(
    boardsCommand
      .command("add")
      .description("Create a board")
      .argument("[name]", "Board name (default from server)")
      .option("--emoji <text>", "Optional emoji before the board name")
      .option("--description <text>", "Board description")
      .option("--description-file <path>", "Read description from a UTF-8 file")
      .option("--description-stdin", "Read description from stdin until EOF"),
  ).action(
    async (
      name: string | undefined,
      options: {
        port?: string;
        emoji?: string;
        description?: string;
        descriptionFile?: string;
        descriptionStdin?: boolean;
      },
    ) => {
      await withCliErrors(() => handleBoardsAdd(ctx, name, options));
    },
  );

  addPortOption(
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
      .option("--clear-board-color", "Clear board color preset"),
  ).action(
    async (
      idOrSlug: string,
      options: {
        port?: string;
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
    ) => {
      await withCliErrors(() => handleBoardsUpdate(ctx, idOrSlug, options));
    },
  );

  addPortOption(
    boardsCommand
      .command("delete")
      .description(
        "Move a board to Trash (same as the app; restore or purge from Trash)",
      )
      .argument("<id-or-slug>", "Board id or slug"),
  ).action(async (idOrSlug: string, options: { port?: string }) => {
    await withCliErrors(() => handleBoardsDelete(ctx, idOrSlug, options));
  });

  addPortOption(
    boardsCommand
      .command("restore")
      .description("Restore a board from Trash to the active board list")
      .argument(
        "<id-or-slug>",
        "Trashed board numeric id, or slug from Trash",
      ),
  ).action(async (idOrSlug: string, options: { port?: string }) => {
    await withCliErrors(() => handleBoardsRestore(ctx, idOrSlug, options));
  });

  addPortOption(
    boardsCommand
      .command("purge")
      .description("Permanently delete a board from Trash (cannot be undone)")
      .argument(
        "<id-or-slug>",
        "Trashed board numeric id, or slug from Trash",
      ),
  ).action(async (idOrSlug: string, options: { port?: string }) => {
    await withCliErrors(() => handleBoardsPurge(ctx, idOrSlug, options));
  });

  addPortOption(
    boardsCommand
      .command("groups")
      .description(
        "Set board task groups (explicit creates, updates, deletes, defaults)",
      )
      .argument("<id-or-slug>", "Board id or slug")
      .option(
        "--json <text>",
        "JSON: creates, updates, deletes, defaultTaskGroupId, deletedGroupFallbackId (optional *ClientId for defaults); see docs/ai-cli.md",
      )
      .option("--file <path>", "Read JSON from a UTF-8 file")
      .option("--stdin", "Read JSON from stdin until EOF"),
  ).action(
    async (
      idOrSlug: string,
      options: { port?: string; json?: string; file?: string; stdin?: boolean },
    ) => {
      await withCliErrors(() => handleBoardsGroups(ctx, idOrSlug, options));
    },
  );

  addPortOption(
    boardsCommand
      .command("priorities")
      .description("Replace board task priorities from JSON")
      .argument("<id-or-slug>", "Board id or slug")
      .option("--json <text>", "JSON array or object with taskPriorities")
      .option("--file <path>", "Read JSON from a UTF-8 file")
      .option("--stdin", "Read JSON from stdin until EOF"),
  ).action(
    async (
      idOrSlug: string,
      options: { port?: string; json?: string; file?: string; stdin?: boolean },
    ) => {
      await withCliErrors(() => handleBoardsPriorities(ctx, idOrSlug, options));
    },
  );
}
