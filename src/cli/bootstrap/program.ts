import { Command, CommanderError, Option } from "commander";
import { registerBoardCommands } from "../commands/boards";
import { registerListCommands } from "../commands/lists";
import { registerReleaseCommands } from "../commands/releases";
import { registerQueryCommands } from "../commands/query";
import { registerServerCommands } from "../commands/server";
import { registerStatusCommands } from "../commands/statuses";
import { registerTaskCommands } from "../commands/tasks";
import { registerTrashCommands } from "../commands/trash";
import { createDefaultCliContext } from "../handlers/context";
import { hasCliConfigFile, resolveProfileName, resolveRuntimeKind } from "../lib/core/config";
import { syncCliOutputFormatFromGlobals } from "../lib/output/cliFormat";
import { syncCliAnsiFromGlobals } from "../lib/output/ansi";
import { CliError, exitWithError, resetCliOutputFormat } from "../lib/output/output";
import { CLI_PACKAGE_VERSION } from "../cliVersion";
import { CLI_ERR } from "../types/errors";
import { HIROTM_CLI_DOCS_OVERVIEW_URL } from "../lib/core/cliWebDocs";
import {
  formatMandatoryOptionHelpHintLine,
  printConciseHirotmRootHelp,
  shouldShowConciseHirotmRootHelp,
} from "../lib/core/cliInvocationHelp";

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

function formatUsageArgument(argument: {
  name(): string;
  required: boolean;
  variadic: boolean;
}): string {
  const name = `${argument.name()}${argument.variadic ? "..." : ""}`;
  return argument.required ? `<${name}>` : `[${name}]`;
}

function applyDerivedUsageLines(command: Command): void {
  for (const subcommand of command.commands) {
    applyDerivedUsageLines(subcommand);
  }

  if (command.commands.length > 0) {
    return;
  }

  const requiredArguments = command.registeredArguments
    .filter((argument) => argument.required)
    .map((argument) => formatUsageArgument(argument));
  const requiredOptions = command.options
    .filter((option) => option.mandatory)
    .map((option) => option.flags);
  const usagePrefix = [...requiredArguments, ...requiredOptions].join(" ");

  // Show mandatory inputs in `Usage:` because Commander help does not surface
  // required options there by default, which made command invocation unclear.
  command.usage(usagePrefix.length > 0 ? `${usagePrefix} [options]` : "[options]");
}

/**
 * Build the hirotm Commander program.
 * CliContext is built here and passed into command registration (see docs/cli-rearchitecture.md).
 */
export function createHirotmProgram(): Command {
  const program = new Command();
  // Before any `.command()` registration: subcommands inherit `_exitCallback` via
  // copyInheritedSettings — needed so leaf parse errors throw (runHirotmCli appends hints).
  program.exitOverride();

  program
    .name("hirotm")
    .description(
      // v${…} in help and --version both use CLI_PACKAGE_VERSION (cli guidelines #1).
      `TaskManager CLI for local app control and JSON queries (v${CLI_PACKAGE_VERSION})`,
    )
    .version(CLI_PACKAGE_VERSION, "-V, --version")
    .option("--profile <name>", "Runtime profile name (default: default, dev)")
    .option(
      "--port <port>",
      "HTTP port for the local API (default: from profile config.json)",
    )
    .option(
      "--client-name <name>",
      "Identify yourself to Users (e.g. Cursor Agent)",
    )
    .addOption(
      new Option("--format <mode>", "Output: ndjson (default) or human")
        .choices(["ndjson", "human"])
        .default("ndjson"),
    )
    .option(
      "-q, --quiet",
      "List reads: print one identifier per line on stdout (requires --format ndjson)",
    )
    // Commander stores this as `color: false`; default `true` when omitted (clig.dev / `--no-color`).
    .option("--no-color", "Disable ANSI styling in human output and stderr (this run only)");

  program.hook("preAction", (_thisCommand, actionCommand) => {
    const opts = actionCommand.optsWithGlobals() as {
      format?: string;
      quiet?: boolean;
      color?: boolean;
    };
    syncCliOutputFormatFromGlobals(opts);
    syncCliAnsiFromGlobals(opts);
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

  applyDerivedUsageLines(program);

  // Cli guidelines #12: web docs on root `hirotm --help` only (`afterAll` would repeat on every subcommand help).
  program.addHelpText(
    "after",
    `

Docs: ${HIROTM_CLI_DOCS_OVERVIEW_URL}
`,
  );

  return program;
}

export async function runHirotmCli(argv: string[]): Promise<void> {
  resetCliOutputFormat();
  // Cli guidelines #10: bare `hirotm` → short intro + examples; `hirotm --help` unchanged.
  if (shouldShowConciseHirotmRootHelp(argv)) {
    printConciseHirotmRootHelp();
    process.exit(0);
  }

  const program = createHirotmProgram();

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.missingMandatoryOptionValue") {
        process.stderr.write(`${formatMandatoryOptionHelpHintLine(argv)}\n`);
      }
      process.exit(error.exitCode);
    }
    exitWithError(error);
  }
}
