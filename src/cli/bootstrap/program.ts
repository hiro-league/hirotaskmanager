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
import { hasCliConfigFile, resolveProfileName, resolveRuntimeKind } from "../lib/config";
import { syncCliOutputFormatFromGlobals } from "../lib/cliFormat";
import { CliError, exitWithError, resetCliOutputFormat } from "../lib/output";
import { CLI_ERR } from "../types/errors";

export function shouldRequireLauncherSetupForHirotm(options: {
  runtimeKind: "installed" | "dev";
  hasInstalledProfileConfig: boolean;
}): boolean {
  return (
    options.runtimeKind === "installed" &&
    options.hasInstalledProfileConfig === false
  );
}

export function getHirotmLauncherSetupCommand(profileName: string): string {
  return profileName === "default"
    ? "hirotaskmanager"
    : `hirotaskmanager --profile ${profileName}`;
}

function ensureInstalledProfileIsReadyForHirotm(): void {
  const runtimeKind = resolveRuntimeKind();
  const profileName = resolveProfileName({ kind: "installed" });
  const hasInstalledProfileConfig = hasCliConfigFile({
    profile: profileName,
    kind: "installed",
  });
  if (
    !shouldRequireLauncherSetupForHirotm({
      runtimeKind,
      hasInstalledProfileConfig,
    })
  ) {
    return;
  }

  const setupCommand = getHirotmLauncherSetupCommand(profileName);
  // Package managers can skip lifecycle scripts, so actionable `hirotm`
  // commands must direct users back to the launcher for first-run setup.
  throw new CliError(
    `No installed TaskManager profile found for "${profileName}". Run \`${setupCommand}\` first to create and configure this profile.`,
    2,
    {
      code: CLI_ERR.missingRequired,
      profile: profileName,
      hint: `Run \`${setupCommand}\` first.`,
    },
  );
}

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
      "--port <port>",
      "HTTP port for the local API (default: from profile config.json)",
    )
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
    ensureInstalledProfileIsReadyForHirotm();
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
