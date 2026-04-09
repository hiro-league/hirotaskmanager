import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import {
  handleListsAdd,
  handleListsDelete,
  handleListsMove,
  handleListsPurge,
  handleListsRestore,
  handleListsUpdate,
} from "../handlers/lists";
import { addPortOption, withCliErrors } from "../lib/command-helpers";

export function registerListCommands(
  program: Command,
  ctx: CliContext,
): void {
  const listsCommand = program
    .command("lists")
    .description("Create and manage lists on boards");

  addPortOption(
    listsCommand
      .command("add")
      .description("Create a list on a board (appended to the end)")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("[name]", "List name (default from server)")
      .option("--emoji <text>", "Optional emoji before the list name"),
  ).action(
    async (
      name: string | undefined,
      options: { port?: string; board: string; emoji?: string },
    ) => {
      await withCliErrors(() => handleListsAdd(ctx, name, options));
    },
  );

  addPortOption(
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
    async (
      listId: string,
      options: {
        port?: string;
        board: string;
        name?: string;
        color?: string;
        clearColor?: boolean;
        emoji?: string;
        clearEmoji?: boolean;
      },
    ) => {
      await withCliErrors(() => handleListsUpdate(ctx, listId, options));
    },
  );

  addPortOption(
    listsCommand
      .command("delete")
      .description(
        "Move a list to Trash (lists restore / purge use the list id only)",
      )
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("<list-id>", "Numeric list id"),
  ).action(
    async (listId: string, options: { port?: string; board: string }) => {
      await withCliErrors(() => handleListsDelete(ctx, listId, options));
    },
  );

  addPortOption(
    listsCommand
      .command("restore")
      .description("Restore a list from Trash (board must be active)")
      .argument("<list-id>", "Numeric list id (see: hirotm trash lists)"),
  ).action(async (listId: string, options: { port?: string }) => {
    await withCliErrors(() => handleListsRestore(ctx, listId, options));
  });

  addPortOption(
    listsCommand
      .command("purge")
      .description("Permanently delete a list from Trash (cannot be undone)")
      .argument("<list-id>", "Numeric list id"),
  ).action(async (listId: string, options: { port?: string }) => {
    await withCliErrors(() => handleListsPurge(ctx, listId, options));
  });

  addPortOption(
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
    async (
      listId: string,
      options: {
        port?: string;
        board: string;
        before?: string;
        after?: string;
        first?: boolean;
        last?: boolean;
      },
    ) => {
      await withCliErrors(() => handleListsMove(ctx, listId, options));
    },
  );
}
