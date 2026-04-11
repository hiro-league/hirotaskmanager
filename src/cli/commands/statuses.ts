import { Command } from "commander";
import type { CliContext } from "../types/context";
import { handleStatusesList } from "../handlers/statuses";
import {
  addPortOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/command-helpers";

export function registerStatusCommands(
  program: Command,
  ctx: CliContext,
): void {
  const statusesCommand = program
    .command("statuses")
    .description("Inspect workflow statuses");

  addPortOption(
    statusesCommand
      .command("list")
      .description("List all statuses")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    cliAction((options: { port?: string; fields?: string }) =>
      handleStatusesList(ctx, options),
    ),
  );
}
