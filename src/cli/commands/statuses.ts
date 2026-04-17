import { Command } from "commander";
import type { CliContext } from "../types/context";
import { handleStatusesList } from "../handlers/statuses";
import {
  addClientNameOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/core/command-helpers";
import { HELP_AFTER_STATUSES_LIST } from "../lib/core/cliCommandHelp";

export function registerStatusCommands(
  program: Command,
  ctx: CliContext,
): void {
  const statusesCommand = program
    .command("statuses")
    .description("Inspect workflow statuses")
    .addHelpText("after", HELP_AFTER_STATUSES_LIST);

  addClientNameOption(
    statusesCommand
      .command("list")
      .description("List all statuses")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
      .addHelpText("after", HELP_AFTER_STATUSES_LIST),
  ).action(
    cliAction((options: { fields?: string }) =>
      handleStatusesList(ctx, options),
    ),
  );
}
