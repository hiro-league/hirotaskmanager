import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import {
  handleServerStart,
  handleServerStatus,
  handleServerStop,
} from "../handlers/server";
import {
  addPortOption,
  addProfileOption,
  withCliErrors,
} from "../lib/command-helpers";

export function registerServerCommands(
  program: Command,
  ctx: CliContext,
): void {
  const server = program
    .command("server")
    .description("Start, stop, or inspect the local TaskManager server");

  addProfileOption(
    server
      .command("start")
      .description("Start the local TaskManager server")
      .option("-b, --background", "Run the server in the background")
      .option("-p, --port <port>", "Port for the local TaskManager API")
      .option("--data-dir <path>", "Override the task data directory"),
  ).action(
    async (options: {
      background?: boolean;
      dataDir?: string;
      port?: string;
    }) => {
      await withCliErrors(() => handleServerStart(ctx, options));
    },
  );

  addProfileOption(
    addPortOption(
      server
        .command("status")
        .description("Show whether the local TaskManager server is running"),
    ),
  ).action(async (options: { port?: string }) => {
    await withCliErrors(() => handleServerStatus(ctx, options));
  });

  addProfileOption(
    addPortOption(
      server
        .command("stop")
        .description(
          "Stop a background server started by hirotm (uses CLI pid file)",
        ),
    ),
  ).action(async (options: { port?: string }) => {
    await withCliErrors(() => handleServerStop(ctx, options));
  });
}
