import { Command } from "commander";
import type { CliContext } from "../types/context";
import {
  handleServerStart,
  handleServerStatus,
  handleServerStop,
} from "../handlers/server";
import { addClientNameOption, addDevOption, addProfileOption, cliAction } from "../lib/core/command-helpers";
import {
  HELP_AFTER_SERVER_GROUP,
  HELP_AFTER_SERVER_START,
  HELP_AFTER_SERVER_STATUS,
  HELP_AFTER_SERVER_STOP,
} from "../lib/core/cliCommandHelp";

export function registerServerCommands(
  program: Command,
  ctx: CliContext,
): void {
  const server = program
    .command("server")
    .description("Start, stop, or inspect the local TaskManager server")
    .addHelpText("after", HELP_AFTER_SERVER_GROUP);

  addDevOption(
    addProfileOption(
      server
        .command("start")
        .description("Start the local TaskManager server")
        .option("-b, --background", "Optional alias for the default background start")
        .option("--foreground", "Run the server in the foreground")
        .addHelpText("after", HELP_AFTER_SERVER_START),
    ),
  ).action(
    cliAction((options: {
      background?: boolean;
      foreground?: boolean;
    }) => handleServerStart(ctx, options)),
  );

  addDevOption(
    addProfileOption(
      addClientNameOption(
        server
          .command("status")
          .description("Show whether the local TaskManager server is running")
          .addHelpText("after", HELP_AFTER_SERVER_STATUS),
      ),
    ),
  ).action(cliAction(() => handleServerStatus(ctx)));

  addDevOption(
    addProfileOption(
      addClientNameOption(
        server
          .command("stop")
          .description(
            "Stop a background server started by hirotm (uses CLI pid file)",
          )
          .addHelpText("after", HELP_AFTER_SERVER_STOP),
      ),
    ),
  ).action(cliAction(() => handleServerStop(ctx)));
}
