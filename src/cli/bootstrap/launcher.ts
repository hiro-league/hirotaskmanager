import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import {
  ensureRuntimeDirectories,
  hasAnyProfileConfigOnDisk,
} from "../../shared/runtimeConfig";
import {
  getDefaultInstalledAuthDir,
  getDefaultInstalledDataDir,
  getCliHomeDir,
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
import { startServer } from "../lib/process";
import { canPromptInteractively } from "../lib/tty";
import {
  isAuthInitialized,
  printDataDirExplainer,
  printFirstWebAuthAndSkillsBox,
  printInteractiveSetupHeader,
  printOpenBrowserExplainer,
  printPortPromptExplainer,
  printRunningAt,
  printSavedProfileSummary,
  printStartingServer,
} from "../lib/launcherUi";

/** Phase 3: installed-app launcher logic (formerly all of app.ts). */

interface LauncherOptions {
  setup?: boolean;
  dataDir?: string;
  browser?: string;
  profile?: string;
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
    const answer = await rl.question(`${question} [${defaultValue}]: `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

async function promptBoolean(
  question: string,
  defaultValue: boolean,
): Promise<boolean> {
  const label = defaultValue ? "Y/n" : "y/N";
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    for (;;) {
      const answer = (await rl.question(`${question} [${label}]: `))
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

  printPortPromptExplainer();
  const portValue = await promptWithDefault(
    "Port number for http://127.0.0.1 (web + API)",
    String(defaults.port),
  );

  printDataDirExplainer();
  const dataDirValue = await promptWithDefault(
    "Folder for database and app data (taskmanager.db, etc.)",
    defaults.data_dir,
  );

  printOpenBrowserExplainer();
  const openBrowser = await promptBoolean(
    "Open this URL in your browser when the server starts",
    defaults.open_browser,
  );

  const config: CliConfigFile = {
    ...existing,
    port: parsePortOption(portValue) ?? defaults.port,
    data_dir: path.resolve(dataDirValue),
    auth_dir: defaults.auth_dir,
    open_browser: openBrowser,
  };
  const savedPath = writeConfigFile(config, configScope);
  const profileRoot = getCliHomeDir(configScope);
  ensureRuntimeDirectories({
    ...configScope,
    dataDir: config.data_dir,
    authDir: config.auth_dir,
  });

  printSavedProfileSummary({
    profileName: resolveProfileName(configScope),
    configPath: savedPath,
    profileRootDir: profileRoot,
    dataDir: path.resolve(config.data_dir!),
    authDir: path.resolve(config.auth_dir!),
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
        const selectedProfile = resolveProfileName({
          profile: options.profile,
          kind: "installed",
        });

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

        printStartingServer(port);

        let browserHandled = false;
        await startServer(
          {
            kind: "installed",
            profile: selectedProfile,
            port,
            dataDir,
          },
          false,
          async (status) => {
            const finalUrl = status.url ?? url;
            printRunningAt(finalUrl);

            // After interactive setup, explain passphrase → recovery key → skills before opening the browser.
            if (
              setupResult.setupMeta.justFinishedInteractiveSetup &&
              !isAuthInitialized(authDir)
            ) {
              printFirstWebAuthAndSkillsBox({ appUrl: finalUrl });
            }

            if (!browserHandled && shouldOpenBrowser) {
              browserHandled = true;
              await openBrowser(finalUrl);
            }
          },
        );
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
