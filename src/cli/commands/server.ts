import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import { handleServerStart, handleServerStatus } from "../handlers/server";
import {
  addPortOption,
  addProfileOption,
  withCliErrors,
} from "../lib/command-helpers";

export function registerServerCommands(
  program: Command,
  ctx: CliContext,
): void {
  addProfileOption(
    program
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
      program
        .command("status")
        .description("Show whether the local TaskManager server is running"),
    ),
  ).action(async (options: { port?: string }) => {
    await withCliErrors(() => handleServerStatus(ctx, options));
  });
}
