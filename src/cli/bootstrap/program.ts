import { Command } from "commander";
import { registerBoardCommands } from "../commands/boards";
import { registerListCommands } from "../commands/lists";
import { registerReleaseCommands } from "../commands/releases";
import { registerSearchCommand } from "../commands/search";
import { registerServerCommands } from "../commands/server";
import { registerStatusCommands } from "../commands/statuses";
import { registerTaskCommands } from "../commands/tasks";
import { registerTrashCommands } from "../commands/trash";
import { createDefaultCliContext } from "../handlers/context";
import { exitWithError } from "../lib/output";

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
    );

  const ctx = createDefaultCliContext();

  registerServerCommands(program, ctx);
  registerBoardCommands(program, ctx);
  registerReleaseCommands(program, ctx);
  registerListCommands(program, ctx);
  registerTaskCommands(program, ctx);
  registerStatusCommands(program, ctx);
  registerTrashCommands(program, ctx);
  registerSearchCommand(program, ctx);

  return program;
}

export async function runHirotmCli(argv: string[]): Promise<void> {
  const program = createHirotmProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    exitWithError(error);
  }
}
