import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import { handleStatusesList } from "../handlers/statuses";
import { addPortOption, withCliErrors } from "../lib/command-helpers";

export function registerStatusCommands(
  program: Command,
  ctx: CliContext,
): void {
  const statusesCommand = program
    .command("statuses")
    .description("Inspect workflow statuses");

  addPortOption(
    statusesCommand.command("list").description("List all statuses"),
  ).action(async (options: { port?: string }) => {
    await withCliErrors(() => handleStatusesList(ctx, options));
  });
}
