import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import {
  handleTrashBoards,
  handleTrashLists,
  handleTrashTasks,
} from "../handlers/trash";
import { addPortOption, withCliErrors } from "../lib/command-helpers";

export function registerTrashCommands(
  program: Command,
  ctx: CliContext,
): void {
  const trashCommand = program
    .command("trash")
    .description("Inspect Trash (same JSON shapes as GET /api/trash/...)");

  addPortOption(
    trashCommand.command("boards").description("List boards in Trash"),
  ).action(async (options: { port?: string }) => {
    await withCliErrors(() => handleTrashBoards(ctx, options));
  });

  addPortOption(
    trashCommand
      .command("lists")
      .description("Lists in Trash (includes board name and canRestore)"),
  ).action(async (options: { port?: string }) => {
    await withCliErrors(() => handleTrashLists(ctx, options));
  });

  addPortOption(
    trashCommand
      .command("tasks")
      .description("Tasks in Trash (includes board/list names and canRestore)"),
  ).action(async (options: { port?: string }) => {
    await withCliErrors(() => handleTrashTasks(ctx, options));
  });
}
