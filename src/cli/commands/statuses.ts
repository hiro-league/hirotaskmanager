import { Command } from "commander";
import type { CliContext } from "../types/context";
import { handleStatusesList } from "../handlers/statuses";
import {
  addClientNameOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/core/command-helpers";

export function registerStatusCommands(
  program: Command,
  ctx: CliContext,
): void {
  const statusesCommand = program
    .command("statuses")
    .description("Inspect workflow statuses");

  addClientNameOption(
    statusesCommand
      .command("list")
      .description("List all statuses")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    cliAction((options: { fields?: string }) =>
      handleStatusesList(ctx, options),
    ),
  );
}
