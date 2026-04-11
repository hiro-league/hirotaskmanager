import { Command, Option } from "commander";
import { registerBoardCommands } from "../commands/boards";
import { registerListCommands } from "../commands/lists";
import { registerReleaseCommands } from "../commands/releases";
import { registerQueryCommands } from "../commands/query";
import { registerServerCommands } from "../commands/server";
import { registerStatusCommands } from "../commands/statuses";
import { registerTaskCommands } from "../commands/tasks";
import { registerTrashCommands } from "../commands/trash";
import { createDefaultCliContext } from "../handlers/context";
import { syncCliOutputFormatFromGlobals } from "../lib/cliFormat";
import { exitWithError, resetCliOutputFormat } from "../lib/output";

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
    .addOption(
      new Option("--format <mode>", "Output: ndjson (default) or human")
        .choices(["ndjson", "human"])
        .default("ndjson"),
    )
    .option(
      "-q, --quiet",
      "List reads: print one identifier per line on stdout (requires --format ndjson)",
    );

  program.hook("preAction", (_thisCommand, actionCommand) => {
    const opts = actionCommand.optsWithGlobals() as {
      format?: string;
      quiet?: boolean;
    };
    syncCliOutputFormatFromGlobals(opts);
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
  resetCliOutputFormat();
  const program = createHirotmProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    exitWithError(error);
  }
}
