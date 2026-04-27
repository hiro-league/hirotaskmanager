import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import {
  listProfileNamesWithConfig,
  resolveAuthDir,
  resolveDefaultProfileName,
} from "../../shared/runtimeConfig";
import {
  generateCliApiKey,
  listCliApiKeyRecords,
  revokeCliApiKeyByPrefix,
} from "../../server/cliApiKeys";
import { CLI_ERR } from "../types/errors";
import { ensureBundledSkills } from "../../shared/skillsInstall";
import {
  hasCliConfigFile,
  readConfigFile,
  resolveApiUrl,
  resolveProfileName,
  resolveProfileRole,
  writeConfigFile,
  writeDefaultProfileName,
  type CliConfigFile,
} from "../lib/core/config";
import { INSTALLED_DEFAULT_PORT } from "../../shared/ports";
import { CliError, exitWithError } from "../lib/output/output";
import { readServerStatus, startServer, stopServer } from "../lib/core/process";
import { buildFlatServerStatus } from "../lib/core/serverStatusOutput";
import { buildLocalServerUrl } from "../../shared/serverStatus";
import { canPromptInteractively } from "../lib/core/tty";
import type { ServerStartMode } from "../ports/process";
import {
  isAuthInitialized,
  paintValue,
  printSetupContinuePrompt,
  printSetupNextSteps,
  printPassphraseHint,
  printRecoveryKey,
  printRecoveryKeyExitHint,
  printSetupToken,
  startInlineSpinner,
} from "../lib/output/launcherUi";
import {
  printSetupAbortFinal,
  printSetupAbortPreview,
} from "../lib/output/setupAbortMessages";
import {
  chooseSetupModeInteractive,
  runClientSetupWizard,
  runServerSetupWizard,
  type LauncherSetupResult,
} from "./setupWizards";
import { createSetupProgress, type SetupProgress } from "./setupProgress";
import { installSigintGate } from "../lib/core/sigintGate";
import { CLI_PACKAGE_VERSION } from "../cliVersion";
import { mintSetupToken } from "../../server/auth";
import {
  needsInstalledBootstrapCeremony,
  resolveEffectiveServerSetupLifecycleState,
} from "../../shared/serverSetupLifecycle";

export type { LauncherSetupResult };

/** Phase 3: installed-app launcher logic (formerly all of app.ts). */

interface LauncherOptions {
  setup?: boolean;
  setupServer?: boolean;
  setupClient?: boolean;
  profile?: string;
}

interface LauncherServerOptions {
  profile?: string;
}

interface LauncherServerStartOptions extends LauncherServerOptions {
  foreground?: boolean;
}

interface LauncherApiKeyOptions {
  profile?: string;
}

interface LauncherApiKeyGenerateOptions extends LauncherApiKeyOptions {
  label?: string;
  saveToProfile?: boolean;
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
  const needsAttachForRecovery =
    options.needsRecoveryKeyExitFlow && !options.alreadyRunning;

  let startMode: ServerStartMode;
  if (needsAttachForRecovery) {
    // Launcher must stay attached so it can print the recovery key — including
    // `hirotaskmanager server start` when auth exists but recovery-key.tmp is
    // still waiting to be shown (first-time bootstrap resume).
    startMode = "background-attached";
  } else if (options.shouldRunSetup) {
    startMode = "foreground";
  } else {
    startMode = options.preferForegroundWhenNotSetup ? "foreground" : "background";
  }

  return {
    startMode,
    readyLabel: options.alreadyRunning ? "Already started" : "Started",
    shouldOpenBrowserOnReady:
      options.shouldOpenBrowser && !options.alreadyRunning,
  };
}

/** Human-facing line after server start/stop; kept aligned across launcher paths. */
function formatServerLifecycleMessage(
  kind: "started" | "already_started" | "stopped",
  url: string,
  profile: string,
): string {
  const headline =
    kind === "stopped"
      ? "Server Stopped"
      : kind === "already_started"
        ? "Server Already started"
        : "Server Started";
  return `${headline} @ ${paintValue(url)} for profile: ${paintValue(profile)}`;
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

async function waitForEnterKey(progress?: SetupProgress): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  // Forward readline's SIGINT into the launcher's gate (sigintGate.ts) so the
  // first Ctrl+C at this pause prints the two-stage warning instead of being
  // swallowed silently by readline.
  const onRlSigint = (): void => {
    process.emit("SIGINT");
  };
  rl.on("SIGINT", onRlSigint);
  if (progress) {
    progress.setCurrentPromptLabel("press Enter to continue");
  }
  try {
    await rl.question("");
  } finally {
    rl.off("SIGINT", onRlSigint);
    if (progress) progress.setCurrentPromptLabel(null);
    rl.close();
  }
}

function resolveInstalledLauncherProfile(profile: string | undefined): string {
  return resolveProfileName({
    profile,
    kind: "installed",
  });
}

function assertLauncherServerProfileForApiKeys(profile: string): void {
  const config = readConfigFile({ profile, kind: "installed" });
  if (!config) {
    throw new CliError(
      `No profile config found for "${profile}". Run hirotaskmanager --setup first.`,
      2,
      { code: CLI_ERR.missingRequired, profile },
    );
  }
  if (config.role !== "server") {
    throw new CliError(
      `Profile "${profile}" is not a server profile — CLI API keys are managed on the server machine only.`,
      2,
      { code: CLI_ERR.invalidArgs, role: config.role },
    );
  }
}

function printLauncherJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

/** Persist `server_setup_state: complete` when auth exists but the profile predates the field. */
function syncServerSetupStateInConfigWhenDerivedComplete(
  profile: string,
  config: CliConfigFile,
  authDir: string,
): CliConfigFile {
  if (config.role !== "server") return config;
  const effective = resolveEffectiveServerSetupLifecycleState(
    "server",
    config.server_setup_state,
    authDir,
  );
  if (effective === "complete" && config.server_setup_state !== "complete") {
    const next: CliConfigFile = {
      ...config,
      server_setup_state: "complete",
    };
    writeConfigFile(next, { profile, kind: "installed" });
    return next;
  }
  return config;
}

/**
 * Installed-server start path shared by the default `hirotaskmanager` action
 * and `hirotaskmanager server start` — mint/setup token, recovery key, and
 * persisted {@link CliConfigFile.server_setup_state}.
 */
async function runInstalledServerStartWithLifecycle(opts: {
  profile: string;
  launcherConfig: CliConfigFile;
  shouldRunSetupForPlan: boolean;
  shouldOpenBrowser: boolean;
  progress?: SetupProgress;
  /** When true (e.g. `server start --foreground`), prefer foreground if not using recovery attach. */
  preferForegroundWhenNotSetup?: boolean;
}): Promise<void> {
  const {
    profile,
    shouldRunSetupForPlan,
    shouldOpenBrowser,
    progress,
    preferForegroundWhenNotSetup,
  } = opts;
  const authDir = resolveAuthDir({
    profile,
    kind: "installed",
  });
  let launcherConfig = syncServerSetupStateInConfigWhenDerivedComplete(
    profile,
    opts.launcherConfig,
    authDir,
  );

  const port = launcherConfig.port ?? INSTALLED_DEFAULT_PORT;
  const url = buildLocalServerUrl(port);

  const lifecycle = resolveEffectiveServerSetupLifecycleState(
    "server",
    launcherConfig.server_setup_state,
    authDir,
  );
  const needsBootstrapCeremony = needsInstalledBootstrapCeremony(lifecycle);

  const authNotInitialized = !isAuthInitialized(authDir);
  const alreadyRunning = shouldRunSetupForPlan
    ? false
    : (
        await readServerStatus({
          kind: "installed",
          profile,
        })
      ).running;

  let bootstrapSetupToken: string | null = null;
  if (authNotInitialized && !alreadyRunning) {
    try {
      bootstrapSetupToken = await mintSetupToken(authDir);
    } catch (error) {
      throw new CliError(
        `Failed to mint first-time setup token in ${authDir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        1,
        { code: CLI_ERR.internalError, authDir },
      );
    }
  }

  const needsRecoveryKeyExitFlow = needsBootstrapCeremony;
  const startPlan = resolveLauncherStartPlan({
    shouldRunSetup: shouldRunSetupForPlan,
    needsRecoveryKeyExitFlow,
    alreadyRunning,
    shouldOpenBrowser,
    preferForegroundWhenNotSetup,
  });

  const startupSpinner = startInlineSpinner(
    `${alreadyRunning ? "Checking Server" : "Starting Server"} with profile ${paintValue(profile)}: ${paintValue(url)}`,
  );

  let browserHandled = false;
  let runningUrl = url;
  try {
    await startServer(
      {
        kind: "installed",
        profile,
      },
      startPlan.startMode,
      async (status) => {
        const finalUrl = status.url;
        runningUrl = finalUrl;
        progress?.setServerUrl(finalUrl);
        progress?.mark("server_started");
        startupSpinner.stop(
          formatServerLifecycleMessage(
            startPlan.readyLabel === "Already started"
              ? "already_started"
              : "started",
            finalUrl,
            profile,
          ),
        );

        if (bootstrapSetupToken) {
          printSetupToken({
            token: bootstrapSetupToken,
            appUrl: finalUrl,
          });
        }

        if (!browserHandled && startPlan.shouldOpenBrowserOnReady) {
          browserHandled = true;
          const browserUrl = bootstrapSetupToken
            ? `${finalUrl}/?setupToken=${encodeURIComponent(bootstrapSetupToken)}`
            : finalUrl;
          await openBrowser(browserUrl);
        }

        // Only prompt for passphrase creation when auth is not initialized yet (skip on recovery-only resume).
        if (needsRecoveryKeyExitFlow && authNotInitialized) {
          await printPassphraseHint();
        }
      },
    );

    if (needsRecoveryKeyExitFlow) {
      const recoveryKey = await waitForRecoveryKeyFile(authDir);
      printRecoveryKey(recoveryKey);
      printRecoveryKeyExitHint(runningUrl);
      progress?.mark("awaiting_recovery_key");
      writeConfigFile(
        {
          ...launcherConfig,
          server_setup_state: "complete",
        },
        { profile, kind: "installed" },
      );
      await waitForEnterKey(progress);
    }
  } finally {
    startupSpinner.stop(null);
  }
}

export function createHirotaskmanagerProgram(): Command {
  const program = new Command();
  program
    .name("hirotaskmanager")
    .description(
      // Match hirotm: root help and --version both surface CLI_PACKAGE_VERSION (cliVersion.ts).
      `Launch the local TaskManager app (v${CLI_PACKAGE_VERSION})`,
    )
    .version(CLI_PACKAGE_VERSION, "-V, --version")
    .option("--setup", "Run or rerun launcher setup for the active profile (role unchanged)")
    .option(
      "--setup-server",
      "Interactive setup: run the API + database on this machine",
    )
    .option(
      "--setup-client",
      "Interactive setup: CLI only, connect to a remote server",
    )
    .option("--profile <name>", "Launcher profile name (default: default)")
    .action(async (options: LauncherOptions) => {
      // Install the two-stage Ctrl+C gate for the entire setup-mode action
      // (CLIG companion §12). The gate prints a warning + "what's done /
      // what's not done" report on the first SIGINT and exits 130 on the
      // second within 5s. Disposed in finally so the foreground server's
      // own SIGINT forwarder (process.ts) takes a clean SIGINT slot when
      // it runs later.
      const progress = createSetupProgress();
      const gate = installSigintGate({
        onFirstPress: () => {
          printSetupAbortPreview(progress.snapshot());
        },
        onSecondPress: () => {
          printSetupAbortFinal(progress.snapshot());
        },
      });
      try {
        const selectedProfile = resolveInstalledLauncherProfile(options.profile);

        if (options.setup && (options.setupServer || options.setupClient)) {
          throw new CliError(
            "Cannot combine --setup with --setup-server or --setup-client.",
            2,
            { code: CLI_ERR.invalidArgs },
          );
        }
        if (options.setupServer && options.setupClient) {
          throw new CliError(
            "Cannot combine --setup-server and --setup-client.",
            2,
            { code: CLI_ERR.invalidArgs },
          );
        }

        let setupResult: LauncherSetupResult | undefined;
        let wizardRan = false;
        let workingProfile = selectedProfile;

        if (options.setupServer) {
          setupResult = await runServerSetupWizard({
            profile: selectedProfile,
            rerun: false,
            progress,
          });
          wizardRan = true;
          workingProfile = setupResult.profileName;
        } else if (options.setupClient) {
          setupResult = await runClientSetupWizard({
            profile: selectedProfile,
            rerun: false,
            progress,
          });
          wizardRan = true;
          workingProfile = setupResult.profileName;
        } else if (options.setup) {
          if (
            !hasCliConfigFile({ profile: selectedProfile, kind: "installed" })
          ) {
            throw new CliError(
              `No profile config found for "${selectedProfile}". Run hirotaskmanager --setup-server or --setup-client first.`,
              2,
              { code: CLI_ERR.missingRequired, profile: selectedProfile },
            );
          }
          const prior = readConfigFile({
            profile: selectedProfile,
            kind: "installed",
          })!;
          if (prior.role === "server") {
            setupResult = await runServerSetupWizard({
              profile: selectedProfile,
              rerun: true,
              progress,
            });
          } else {
            setupResult = await runClientSetupWizard({
              profile: selectedProfile,
              rerun: true,
              progress,
            });
          }
          wizardRan = true;
          workingProfile = setupResult.profileName;
        } else if (
          !hasCliConfigFile({ profile: selectedProfile, kind: "installed" })
        ) {
          if (canPromptInteractively()) {
            const mode = await chooseSetupModeInteractive(progress);
            if (mode === "client") {
              setupResult = await runClientSetupWizard({
                profile: selectedProfile,
                rerun: false,
                progress,
              });
            } else {
              setupResult = await runServerSetupWizard({
                profile: selectedProfile,
                rerun: false,
                progress,
              });
            }
          } else {
            // Refuse to silently auto-provision a server profile in CI / no-TTY
            // contexts: the previous default ran the server wizard non-
            // interactively, which surprised operators piping `hirotaskmanager`
            // into ansible/packer when they actually wanted a client profile
            // (or no setup at all). Force the operator to choose explicitly.
            throw new CliError(
              `No profile config for "${selectedProfile}" and no TTY to ask. ` +
                "Pass --setup-server or --setup-client to choose a setup mode non-interactively.",
              2,
              { code: CLI_ERR.invalidArgs, profile: selectedProfile },
            );
          }
          wizardRan = true;
          workingProfile = setupResult!.profileName;
        }

        if (!setupResult) {
          const config = readConfigFile({
            profile: workingProfile,
            kind: "installed",
          });
          if (!config) {
            throw new CliError(
              `No profile config found for "${workingProfile}". Run hirotaskmanager --setup first.`,
              2,
              { code: CLI_ERR.missingRequired, profile: workingProfile },
            );
          }
          setupResult = {
            config,
            profileName: workingProfile,
            setupMeta: {
              justFinishedInteractiveSetup: false,
              firstProfileOnMachine: false,
              shouldStartLocalServer: true,
            },
          };
        }

        const launcherConfig = setupResult.config;

        if (launcherConfig.role === "client") {
          const skillsInstalled = ensureBundledSkills();
          if (setupResult.setupMeta.justFinishedInteractiveSetup) {
            printSetupNextSteps({
              profileName: workingProfile,
              skillsInstalled,
            });
          } else {
            console.log(
              `Profile "${workingProfile}" is a client profile (remote CLI only). Use hirotm for day-to-day commands.`,
            );
          }
          return;
        }

        const shouldRunSetupForPlan = wizardRan;

        const skillsInstalled = ensureBundledSkills();
        if (
          setupResult.setupMeta.justFinishedInteractiveSetup ||
          setupResult.setupMeta.firstProfileOnMachine
        ) {
          printSetupNextSteps({
            profileName: workingProfile,
            skillsInstalled,
          });
          if (setupResult.setupMeta.justFinishedInteractiveSetup) {
            printSetupContinuePrompt();
            await waitForEnterKey(progress);
          }
        }

        await runInstalledServerStartWithLifecycle({
          profile: workingProfile,
          launcherConfig: launcherConfig,
          shouldRunSetupForPlan,
          shouldOpenBrowser: launcherConfig.open_browser ?? true,
          progress,
        });
      } catch (error) {
        exitWithError(error);
      } finally {
        gate.dispose();
      }
    });

  program
    .command("profile")
    .description("Manage the default hirotm profile pointer (~/.taskmanager/config.json)")
    .command("use")
    .argument("<name>", "Existing profile name (must have profiles/<name>/config.json)")
    .description("Set default_profile so hirotm can omit --profile")
    .action(async (name: string) => {
      try {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new CliError("Profile name is required.", 2, {
            code: CLI_ERR.invalidValue,
          });
        }
        if (!hasCliConfigFile({ profile: trimmed, kind: "installed" })) {
          const available = listProfileNamesWithConfig();
          throw new CliError(
            `No profile named "${trimmed}" found.${
              available.length ? ` Available: ${available.join(", ")}` : ""
            }`,
            2,
            {
              code: CLI_ERR.notFound,
              profile: trimmed,
              available,
            },
          );
        }
        // Capture the previous pointer so JSON consumers (and humans reading
        // stderr) can see the transition rather than guessing whether the
        // command was a no-op (issue #16 follow-up).
        const previous = resolveDefaultProfileName() ?? null;
        writeDefaultProfileName(trimmed);
        if (previous && previous !== trimmed) {
          process.stderr.write(
            `Default profile changed: ${previous} -> ${trimmed}\n`,
          );
        } else if (!previous) {
          process.stderr.write(`Default profile set to "${trimmed}"\n`);
        }
        printLauncherJson({
          ok: true,
          default_profile: trimmed,
          previous_default_profile: previous,
        });
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
    .option("--foreground", "Run the server in the foreground")
    .action(async (options: LauncherServerStartOptions, command: Command) => {
      try {
        const profile = resolveInstalledLauncherProfile(
          (command.optsWithGlobals() as LauncherServerStartOptions).profile ?? options.profile,
        );
        const config = readConfigFile({ profile, kind: "installed" });
        if (!config) {
          throw new CliError(
            `No profile config found for "${profile}". Run hirotaskmanager --setup first.`,
            2,
            { code: CLI_ERR.missingRequired, profile },
          );
        }
        if (config.role !== "server") {
          throw new CliError(
            `Profile "${profile}" is a client profile — use the remote API URL, not hirotaskmanager server start.`,
            2,
            { code: CLI_ERR.invalidArgs, role: config.role },
          );
        }
        // Same bootstrap ceremony as the default launcher: mint/setup token,
        // recovery key, and server_setup_state — so `server start` is not a
        // second-class entry point for first-time setup.
        await runInstalledServerStartWithLifecycle({
          profile,
          launcherConfig: config,
          shouldRunSetupForPlan: false,
          shouldOpenBrowser: false,
          preferForegroundWhenNotSetup: options.foreground === true,
        });
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
        const overrides = { kind: "installed" as const, profile };
        const status = await readServerStatus(overrides);
        // Match `hirotm server status`: top-level URL fields describe the
        // active profile, while the server's loopback health URL is diagnostic.
        printLauncherJson(buildFlatServerStatus(status, {
          profile: resolveProfileName(overrides),
          role: resolveProfileRole(overrides),
          api_url: resolveApiUrl(overrides),
        }));
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
        const stopConfig = readConfigFile({ profile, kind: "installed" });
        if (!stopConfig) {
          throw new CliError(
            `No profile config found for "${profile}". Run hirotaskmanager --setup first.`,
            2,
            { code: CLI_ERR.missingRequired, profile },
          );
        }
        const stopUrl = buildLocalServerUrl(
          stopConfig.port ?? INSTALLED_DEFAULT_PORT,
        );
        const stopSpinner = startInlineSpinner(
          `Stopping Server with profile ${paintValue(profile)}: ${paintValue(stopUrl)}`,
        );
        try {
          await stopServer({
            kind: "installed",
            profile,
          });
          stopSpinner.stop(
            formatServerLifecycleMessage("stopped", stopUrl, profile),
          );
        } finally {
          stopSpinner.stop(null);
        }
      } catch (error) {
        exitWithError(error);
      }
    });

  const apiKey = server
    .command("api-key")
    .description(
      "Create and manage CLI API keys in cli-api-keys.json (server profile only)",
    );

  apiKey
    .command("generate")
    .description(
      "Generate a new CLI API key and print it once (stdout). Does not require the HTTP server.",
    )
    .option("--label <text>", "Optional label stored with the key")
    .option(
      "--save-to-profile",
      "Also write the key to this profile config as api_key (local CLI)",
    )
    .option("--profile <name>", "Installed profile name")
    .action(
      async (
        options: LauncherApiKeyGenerateOptions,
        command: Command,
      ): Promise<void> => {
        try {
          const profile = resolveInstalledLauncherProfile(
            (command.optsWithGlobals() as LauncherServerOptions).profile ??
              options.profile,
          );
          assertLauncherServerProfileForApiKeys(profile);
          const authDir = resolveAuthDir({ kind: "installed", profile });
          const { key } = await generateCliApiKey({
            authDir,
            label: options.label,
          });
          process.stdout.write(`${key}\n`);
          if (options.saveToProfile) {
            const cfg = readConfigFile({ profile, kind: "installed" });
            if (!cfg) {
              throw new CliError(
                `No profile config found for "${profile}".`,
                2,
                { code: CLI_ERR.missingRequired, profile },
              );
            }
            // Surface silent rotation: the previous version overwrote any
            // existing api_key without a peep, which made it easy to bork the
            // local CLI by re-running `generate --save-to-profile` without
            // realizing it invalidates the prior key for this machine. Warn
            // on stderr so JSON consumers parsing stdout are unaffected.
            if (cfg.api_key && cfg.api_key !== key) {
              process.stderr.write(
                `[taskmanager] Warning: replaced existing api_key in profile "${profile}". ` +
                  "The previous local-CLI key for this profile is no longer valid for this machine.\n",
              );
            }
            writeConfigFile(
              { ...cfg, api_key: key },
              { kind: "installed", profile },
            );
          }
        } catch (error) {
          exitWithError(error);
        }
      },
    );

  apiKey
    .command("list")
    .description("List CLI API key ids, labels, and createdAt (hashes never shown)")
    .option("--profile <name>", "Installed profile name")
    .action(async (options: LauncherApiKeyOptions, command: Command) => {
      try {
        const profile = resolveInstalledLauncherProfile(
          (command.optsWithGlobals() as LauncherServerOptions).profile ??
            options.profile,
        );
        assertLauncherServerProfileForApiKeys(profile);
        const authDir = resolveAuthDir({ kind: "installed", profile });
        const rows = await listCliApiKeyRecords(authDir);
        printLauncherJson(
          rows.map((r) => ({
            id: r.id,
            label: r.label,
            createdAt: r.createdAt,
          })),
        );
      } catch (error) {
        exitWithError(error);
      }
    });

  apiKey
    .command("revoke")
    .description("Revoke a key by id prefix (minimum 4 characters)")
    .argument("<prefix>", "Key id prefix, e.g. tmk-a3f8")
    .option("--profile <name>", "Installed profile name")
    .action(
      async (
        prefix: string,
        options: LauncherApiKeyOptions,
        command: Command,
      ) => {
        try {
          const profile = resolveInstalledLauncherProfile(
            (command.optsWithGlobals() as LauncherServerOptions).profile ??
              options.profile,
          );
          assertLauncherServerProfileForApiKeys(profile);
          const authDir = resolveAuthDir({ kind: "installed", profile });
          let revoked;
          try {
            revoked = await revokeCliApiKeyByPrefix(authDir, prefix);
          } catch (e) {
            if (e instanceof Error) {
              throw new CliError(e.message, 2, { code: CLI_ERR.invalidValue });
            }
            throw e;
          }
          printLauncherJson({
            id: revoked.id,
            label: revoked.label,
            createdAt: revoked.createdAt,
          });
        } catch (error) {
          exitWithError(error);
        }
      },
    );

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
