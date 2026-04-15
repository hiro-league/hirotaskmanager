import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import {
  ensureRuntimeDirectories,
  hasAnyProfileConfigOnDisk,
} from "../../shared/runtimeConfig";
import { ensureBundledSkills } from "../../shared/skillsInstall";
import {
  getDefaultInstalledAuthDir,
  getDefaultInstalledDataDir,
  hasCliConfigFile,
  readConfigFile,
  resolveProfileName,
  writeConfigFile,
  type CliConfigFile,
} from "../lib/config";
import { parsePortOption } from "../lib/command-helpers";
import { CLI_ERR } from "../types/errors";
import { CLI_DEFAULTS } from "../lib/constants";
import { CliError, exitWithError } from "../lib/output";
import { readServerStatus, startServer, stopServer } from "../lib/process";
import { canPromptInteractively } from "../lib/tty";
import type { ServerStartMode } from "../ports/process";
import {
  formatBooleanPrompt,
  formatTextPrompt,
  isAuthInitialized,
  paintValue,
  printPassphraseHint,
  printRecoveryKey,
  printRecoveryKeyExitHint,
  printInteractiveSetupHeader,
  printSavedProfileSummary,
  spinForMoment,
  startInlineSpinner,
} from "../lib/launcherUi";

/** Phase 3: installed-app launcher logic (formerly all of app.ts). */

interface LauncherOptions {
  setup?: boolean;
  dataDir?: string;
  browser?: string;
  profile?: string;
}

interface LauncherServerOptions {
  profile?: string;
}

interface LauncherServerStartOptions extends LauncherServerOptions {
  dataDir?: string;
  foreground?: boolean;
}

export interface LauncherSetupResult {
  config: CliConfigFile;
  setupMeta: {
    /** User went through interactive prompts (not bunx / non-TTY defaults). */
    justFinishedInteractiveSetup: boolean;
    /** No profile had config.json on disk before this run’s save. */
    firstProfileOnMachine: boolean;
  };
}

export function resolveLauncherStartPlan(options: {
  shouldRunSetup: boolean;
  needsRecoveryKeyExitFlow: boolean;
  alreadyRunning: boolean;
  shouldOpenBrowser: boolean;
  preferForegroundWhenNotSetup?: boolean;
}): {
  startMode: ServerStartMode;
  readyLabel: "Started" | "Already started";
  shouldOpenBrowserOnReady: boolean;
} {
  return {
    startMode: options.shouldRunSetup
      ? options.needsRecoveryKeyExitFlow
        ? "background-attached"
        : "foreground"
      : options.preferForegroundWhenNotSetup
        ? "foreground"
        : "background",
    readyLabel: options.alreadyRunning ? "Already started" : "Started",
    shouldOpenBrowserOnReady:
      options.shouldOpenBrowser && !options.alreadyRunning,
  };
}

function parseBrowserMode(browser: string | undefined): boolean | undefined {
  if (!browser?.trim()) return undefined;

  const normalized = browser.trim().toLowerCase();
  if (normalized === "auto" || normalized === "open" || normalized === "on") {
    return true;
  }
  if (
    normalized === "manual" ||
    normalized === "off" ||
    normalized === "closed"
  ) {
    return false;
  }

  throw new CliError("Invalid browser mode", 2, {
    code: CLI_ERR.invalidValue,
    browser,
    hint: "Use --browser auto or --browser manual.",
  });
}

function resolveLauncherDefaults(overrides: {
  profile?: string;
  port?: number;
  dataDir?: string;
  openBrowser?: boolean;
}): Required<
  Pick<CliConfigFile, "port" | "data_dir" | "auth_dir" | "open_browser">
> {
  const configScope = { profile: overrides.profile, kind: "installed" as const };
  const existing = readConfigFile(configScope);
  return {
    port: overrides.port ?? existing.port ?? CLI_DEFAULTS.INSTALLED_DEFAULT_PORT,
    data_dir: path.resolve(
      overrides.dataDir ??
        existing.data_dir ??
        getDefaultInstalledDataDir(configScope),
    ),
    auth_dir: path.resolve(
      existing.auth_dir ?? getDefaultInstalledAuthDir(configScope),
    ),
    open_browser: overrides.openBrowser ?? existing.open_browser ?? true,
  };
}

async function promptWithDefault(
  question: string,
  defaultValue: string,
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(`${question} `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

async function promptBoolean(
  question: string,
  defaultValue: boolean,
): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    for (;;) {
      const answer = (await rl.question(`${question}: `))
        .trim()
        .toLowerCase();
      if (!answer) return defaultValue;
      if (answer === "y" || answer === "yes") return true;
      if (answer === "n" || answer === "no") return false;
      console.log("Please answer yes or no.");
    }
  } finally {
    rl.close();
  }
}

async function runLauncherSetup(overrides: {
  profile?: string;
  port?: number;
  dataDir?: string;
  openBrowser?: boolean;
}): Promise<LauncherSetupResult> {
  const defaults = resolveLauncherDefaults(overrides);
  const configScope = { profile: overrides.profile, kind: "installed" as const };
  const existing = readConfigFile(configScope);
  const machineHadNoProfilesBefore = !hasAnyProfileConfigOnDisk();

  // Keep the first-run path working for bunx and other non-interactive entry
  // points by saving sane defaults instead of failing on missing prompts.
  if (!canPromptInteractively()) {
    const config = { ...existing, ...defaults };
    writeConfigFile(config, configScope);
    ensureRuntimeDirectories({
      ...configScope,
      dataDir: config.data_dir,
      authDir: config.auth_dir,
    });
    return {
      config,
      setupMeta: {
        justFinishedInteractiveSetup: false,
        firstProfileOnMachine: machineHadNoProfilesBefore,
      },
    };
  }

  printInteractiveSetupHeader({
    profileName: resolveProfileName(configScope),
    firstProfileOnMachine: machineHadNoProfilesBefore,
  });

  // Show the profile context line first so the user understands why the
  // following prompts are being asked.
  await spinForMoment(
    "Looking for existing profiles...",
    machineHadNoProfilesBefore
      ? `Creating Profile: ${paintValue(resolveProfileName(configScope))}`
      : `Using Profile: ${paintValue(resolveProfileName(configScope))}`,
  );

  const portValue = await promptWithDefault(
    formatTextPrompt("Pick a port for web/api", String(defaults.port)),
    String(defaults.port),
  );

  const dataDirValue = await promptWithDefault(
    formatTextPrompt(
      "Pick a Data Directory to place the database",
      defaults.data_dir,
    ),
    defaults.data_dir,
  );

  const openBrowser = await promptBoolean(
    formatBooleanPrompt(
      "Open default browser when starting the server with hirotaskmanager",
      defaults.open_browser,
    ),
    defaults.open_browser,
  );

  const config: CliConfigFile = {
    ...existing,
    port: parsePortOption(portValue) ?? defaults.port,
    data_dir: path.resolve(dataDirValue),
    auth_dir: defaults.auth_dir,
    open_browser: openBrowser,
  };
  writeConfigFile(config, configScope);
  ensureRuntimeDirectories({
    ...configScope,
    dataDir: config.data_dir,
    authDir: config.auth_dir,
  });

  await spinForMoment(
    machineHadNoProfilesBefore
      ? `Saving Profile: ${paintValue(resolveProfileName(configScope))}`
      : `Saving Profile: ${paintValue(resolveProfileName(configScope))}`,
  );

  printSavedProfileSummary({
    created: machineHadNoProfilesBefore,
    profileName: resolveProfileName(configScope),
    appUrl: `http://127.0.0.1:${config.port}`,
    dataDir: path.resolve(config.data_dir!),
    openBrowser,
  });

  return {
    config,
    setupMeta: {
      justFinishedInteractiveSetup: true,
      firstProfileOnMachine: machineHadNoProfilesBefore,
    },
  };
}

async function openBrowser(url: string): Promise<void> {
  try {
    const command =
      process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : process.platform === "darwin"
          ? ["open", url]
          : ["xdg-open", url];

    const child = Bun.spawn({
      cmd: command,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    });
    child.unref();
  } catch {
    console.warn(`Could not open a browser automatically. Visit ${url}`);
  }
}

/**
 * Poll for the recovery-key sidecar file written by the server during
 * `setupPassphrase`. Returns the key string once available, then deletes the
 * file so it is never left on disk.
 */
async function waitForRecoveryKeyFile(authDir: string): Promise<string> {
  const keyPath = path.join(authDir, "recovery-key.tmp");
  while (!existsSync(keyPath)) {
    await Bun.sleep(250);
  }
  const key = readFileSync(keyPath, "utf8").trim();
  try {
    unlinkSync(keyPath);
  } catch {
    // Best-effort cleanup; the file has owner-only perms already.
  }
  return key;
}

async function waitForEnterToExitLauncher(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    await rl.question("");
  } finally {
    rl.close();
  }
}

function resolveInstalledLauncherProfile(profile: string | undefined): string {
  return resolveProfileName({
    profile,
    kind: "installed",
  });
}

function printLauncherJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

export function createHirotaskmanagerProgram(): Command {
  const program = new Command();
  program
    .name("hirotaskmanager")
    .description("Launch the local TaskManager app")
    .option("--setup", "Run or rerun launcher setup")
    .option("--data-dir <path>", "Override the task data directory")
    .option("--profile <name>", "Launcher profile name (default: default)")
    .option(
      "--browser <mode>",
      "Browser mode: auto to open the app, manual to print the URL only",
    )
    .action(async (options: LauncherOptions) => {
      try {
        const overrideDataDir = options.dataDir?.trim()
          ? path.resolve(options.dataDir.trim())
          : undefined;
        const overrideOpenBrowser = parseBrowserMode(options.browser);
        const selectedProfile = resolveInstalledLauncherProfile(options.profile);

        const shouldRunSetup =
          options.setup ||
          !hasCliConfigFile({ profile: selectedProfile, kind: "installed" });

        const setupResult: LauncherSetupResult = shouldRunSetup
          ? await runLauncherSetup({
              profile: selectedProfile,
              dataDir: overrideDataDir,
              openBrowser: overrideOpenBrowser,
            })
          : {
              config: readConfigFile({
                profile: selectedProfile,
                kind: "installed",
              }),
              setupMeta: {
                justFinishedInteractiveSetup: false,
                firstProfileOnMachine: false,
              },
            };

        // Safety net: copy bundled skills to ~/.taskmanager/skills/ if
        // postinstall was skipped (--ignore-scripts, CI, bunx) or stale.
        ensureBundledSkills();

        const launcherConfig = setupResult.config;

        const port =
          launcherConfig.port ?? CLI_DEFAULTS.INSTALLED_DEFAULT_PORT;
        const dataDir = path.resolve(
          overrideDataDir ??
            launcherConfig.data_dir ??
            getDefaultInstalledDataDir({
              profile: selectedProfile,
              kind: "installed",
            }),
        );
        const authDir = path.resolve(
          launcherConfig.auth_dir ??
            getDefaultInstalledAuthDir({
              profile: selectedProfile,
              kind: "installed",
            }),
        );
        const shouldOpenBrowser =
          overrideOpenBrowser ?? launcherConfig.open_browser ?? true;

        const url = `http://127.0.0.1:${port}`;
        const needsRecoveryKeyExitFlow =
          setupResult.setupMeta.justFinishedInteractiveSetup &&
          !isAuthInitialized(authDir);
        // Keep normal launcher runs non-blocking, and avoid reopening the browser
        // when the launcher is only attaching to an already running profile.
        const alreadyRunning = shouldRunSetup
          ? false
          : (
              await readServerStatus({
                kind: "installed",
                profile: selectedProfile,
                port,
              })
            ).running;
        const startPlan = resolveLauncherStartPlan({
          shouldRunSetup,
          needsRecoveryKeyExitFlow,
          alreadyRunning,
          shouldOpenBrowser,
        });

        const startupSpinner = startInlineSpinner(
          `${alreadyRunning ? "Checking Server" : "Starting Server"} with profile ${paintValue(selectedProfile)}: ${paintValue(url)}`,
        );
        const previousSilentStartup = process.env.TASKMANAGER_SILENT_STARTUP_LOG;
        // Let the launcher own startup copy so first-time setup stays compact.
        process.env.TASKMANAGER_SILENT_STARTUP_LOG = "1";

        let browserHandled = false;
        let runningUrl = url;
        try {
          await startServer(
            {
              kind: "installed",
              profile: selectedProfile,
              port,
              dataDir,
            },
            startPlan.startMode,
            async (status) => {
              const finalUrl = status.url;
              runningUrl = finalUrl;
              startupSpinner.stop(
                `${startPlan.readyLabel}, listening at ${paintValue(finalUrl)}`,
              );

              if (!browserHandled && startPlan.shouldOpenBrowserOnReady) {
                browserHandled = true;
                await openBrowser(finalUrl);
              }

              if (needsRecoveryKeyExitFlow) {
                await printPassphraseHint();
              }
            },
          );

          if (needsRecoveryKeyExitFlow) {
            const recoveryKey = await waitForRecoveryKeyFile(authDir);
            printRecoveryKey(recoveryKey);
            printRecoveryKeyExitHint(runningUrl);
            await waitForEnterToExitLauncher();
          }
        } finally {
          if (previousSilentStartup === undefined) {
            delete process.env.TASKMANAGER_SILENT_STARTUP_LOG;
          } else {
            process.env.TASKMANAGER_SILENT_STARTUP_LOG = previousSilentStartup;
          }
          startupSpinner.stop(null);
        }
      } catch (error) {
        exitWithError(error);
      }
    });

  const server = program
    .command("server")
    .description("Start, stop, or inspect the installed TaskManager server");

  server
    .command("start")
    .description("Start the installed TaskManager server")
    .option("--profile <name>", "Launcher profile name for this command")
    .option("--data-dir <path>", "Override the task data directory")
    .option("--foreground", "Run the server in the foreground")
    .action(async (options: LauncherServerStartOptions, command: Command) => {
      try {
        const profile = resolveInstalledLauncherProfile(
          (command.optsWithGlobals() as LauncherServerStartOptions).profile ?? options.profile,
        );
        const overrideDataDir = options.dataDir?.trim()
          ? path.resolve(options.dataDir.trim())
          : undefined;
        const config = readConfigFile({ profile, kind: "installed" });
        const port = config.port ?? CLI_DEFAULTS.INSTALLED_DEFAULT_PORT;
        const dataDir = path.resolve(
          overrideDataDir ??
            config.data_dir ??
            getDefaultInstalledDataDir({ profile, kind: "installed" }),
        );
        const status = await readServerStatus({
          kind: "installed",
          profile,
          port,
        });
        const startPlan = resolveLauncherStartPlan({
          shouldRunSetup: false,
          needsRecoveryKeyExitFlow: false,
          alreadyRunning: status.running,
          shouldOpenBrowser: false,
          preferForegroundWhenNotSetup: options.foreground === true,
        });
        const startupSpinner = startInlineSpinner(
          `${status.running ? "Checking Server" : "Starting Server"} with profile ${paintValue(profile)}: ${paintValue(status.running ? status.url : `http://127.0.0.1:${port}`)}`,
        );

        try {
          // Launcher `server start` is human-facing, so prefer concise text
          // instead of JSON while still sharing the same server lifecycle path.
          await startServer(
            {
              kind: "installed",
              profile,
              port,
              dataDir,
            },
            startPlan.startMode,
            async (started) => {
              startupSpinner.stop(
                `${startPlan.readyLabel}, listening at ${paintValue(started.url)}`,
              );
            },
          );
        } finally {
          startupSpinner.stop(null);
        }
      } catch (error) {
        exitWithError(error);
      }
    });

  server
    .command("status")
    .description("Show whether the installed TaskManager server is running")
    .option("--profile <name>", "Launcher profile name for this command")
    .action(async (options: LauncherServerOptions, command: Command) => {
      try {
        const profile = resolveInstalledLauncherProfile(
          (command.optsWithGlobals() as LauncherServerOptions).profile ?? options.profile,
        );
        printLauncherJson(
          await readServerStatus({
            kind: "installed",
            profile,
          }),
        );
      } catch (error) {
        exitWithError(error);
      }
    });

  server
    .command("stop")
    .description("Stop a background installed server started for this profile")
    .option("--profile <name>", "Launcher profile name for this command")
    .action(async (options: LauncherServerOptions, command: Command) => {
      try {
        const profile = resolveInstalledLauncherProfile(
          (command.optsWithGlobals() as LauncherServerOptions).profile ?? options.profile,
        );
        const stopSpinner = startInlineSpinner(
          `Stopping Server with profile ${paintValue(profile)}`,
        );
        try {
          await stopServer({
            kind: "installed",
            profile,
          });
          stopSpinner.stop("Server stopped");
        } finally {
          stopSpinner.stop(null);
        }
      } catch (error) {
        exitWithError(error);
      }
    });

  return program;
}

export async function runHirotaskmanagerCli(argv: string[]): Promise<void> {
  const program = createHirotaskmanagerProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    exitWithError(error);
  }
}
