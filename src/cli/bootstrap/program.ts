import { Command } from "commander";
import { registerBoardCommands } from "../commands/boards";
import { registerListCommands } from "../commands/lists";
import { registerReleaseCommands } from "../commands/releases";
import { registerQueryCommands } from "../commands/query";
import { registerServerCommands } from "../commands/server";
import { registerStatusCommands } from "../commands/statuses";
import { registerTaskCommands } from "../commands/tasks";
import { registerTrashCommands } from "../commands/trash";
import { createDefaultCliContext } from "../handlers/context";
import {
  exitWithError,
  resetCliJsonFormatForRun,
  syncCliJsonFormatFromGlobals,
} from "../lib/output";

/**
 * Build the hirotm Commander program.
 * CliContext is built here and passed into command registration (see docs/cli-rearchitecture.md).
 */
export function createHirotmProgram(): Command {
  const program = new Command();
  program
    .name("hirotm")
    .description("TaskManager CLI for local app control and JSON queries")
    .option("--profile <name>", "Runtime profile name (default: default, dev)")
    .option(
      "--client-name <name>",
      "Human-friendly client label sent with API requests (for notifications)",
    )
    .option(
      "--pretty",
      "Pretty-print JSON with indentation (default is compact single-line on stdout and stderr)",
    );

  program.hook("preAction", (_thisCommand, actionCommand) => {
    const opts = actionCommand.optsWithGlobals() as { pretty?: boolean };
    syncCliJsonFormatFromGlobals(opts);
  });

  const ctx = createDefaultCliContext();

  registerServerCommands(program, ctx);
  registerBoardCommands(program, ctx);
  registerReleaseCommands(program, ctx);
  registerListCommands(program, ctx);
  registerTaskCommands(program, ctx);
  registerStatusCommands(program, ctx);
  registerTrashCommands(program, ctx);
  registerQueryCommands(program, ctx);

  return program;
}

export async function runHirotmCli(argv: string[]): Promise<void> {
  resetCliJsonFormatForRun();
  const program = createHirotmProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    exitWithError(error);
  }
}
