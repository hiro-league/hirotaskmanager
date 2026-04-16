import { Command } from "commander";
import type { CliContext } from "../types/context";
import {
  handleServerStart,
  handleServerStatus,
  handleServerStop,
} from "../handlers/server";
import { addClientNameOption, addDevOption, addProfileOption, cliAction } from "../lib/core/command-helpers";

export function registerServerCommands(
  program: Command,
  ctx: CliContext,
): void {
  const server = program
    .command("server")
    .description("Start, stop, or inspect the local TaskManager server");

  addDevOption(
    addProfileOption(
      server
        .command("start")
        .description("Start the local TaskManager server")
        .option("-b, --background", "Optional alias for the default background start")
        .option("--foreground", "Run the server in the foreground")
        .option("--data-dir <path>", "Override the task data directory"),
    ),
  ).action(
    cliAction((options: {
      background?: boolean;
      foreground?: boolean;
      dataDir?: string;
    }) => handleServerStart(ctx, options)),
  );

  addDevOption(
    addProfileOption(
      addClientNameOption(
        server
          .command("status")
          .description("Show whether the local TaskManager server is running"),
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
          ),
      ),
    ),
  ).action(cliAction(() => handleServerStop(ctx)));
}
