/**
 * Phase 6: interactive setup flows for server and client profiles (design §2.8).
 * Initial development: no backward compatibility with pre-role profiles.
 */
import path from "node:path";
import process from "node:process";
import type { Interface as ReadlineInterface } from "node:readline";
import { createInterface } from "node:readline/promises";
import type { SetupProgress } from "./setupProgress";
import {
  DEFAULT_BIND_ADDRESS,
  ensureRuntimeDirectories,
  hasAnyProfileConfigOnDisk,
  isLoopbackBindAddress,
  isWellFormedCliApiKey,
  resolveAuthDir,
  resolveDefaultProfileName,
  resolveRequireCliApiKey,
} from "../../shared/runtimeConfig";
import { generateCliApiKey } from "../../server/cliApiKeys";
import { INSTALLED_DEFAULT_PORT } from "../../shared/ports";
import { CLI_ERR } from "../types/errors";
import { parsePortOption } from "../lib/core/command-helpers";
import {
  getDefaultInstalledDataDir,
  readConfigFile,
  writeConfigFile,
  writeDefaultProfileName,
  type CliConfigFile,
} from "../lib/core/config";
import { canPromptInteractively } from "../lib/core/tty";
import { buildLocalServerUrl } from "../../shared/serverStatus";
import { CliError } from "../lib/output/output";
import {
  formatBooleanPrompt,
  formatTextPrompt,
  printCliApiKey,
  printInteractiveSetupHeader,
  printSavedProfileSummary,
  spinForMoment,
} from "../lib/output/launcherUi";

export interface LauncherSetupMeta {
  justFinishedInteractiveSetup: boolean;
  firstProfileOnMachine: boolean;
  /** When false, launcher must not start the local Bun server. */
  shouldStartLocalServer: boolean;
}

export interface LauncherSetupResult {
  config: CliConfigFile;
  /** Profile directory name (may differ from argv if the user renamed during the wizard). */
  profileName: string;
  setupMeta: LauncherSetupMeta;
}

/**
 * Guard re-runs of `--setup-server` / `--setup-client` against silently
 * stomping a profile that exists with the other role (design §2.8: role is
 * immutable). Also catches `--setup --profile <missing>` early so the user
 * gets an actionable message instead of dropping into an empty wizard.
 *
 * Centralized here because the same three-branch check (mismatched role,
 * rerun-but-no-cfg, otherwise-OK) used to live verbatim in both wizards and
 * was easy to drift apart.
 */
function assertRoleAllowsWizard(
  profile: string,
  expected: "server" | "client",
  rerun: boolean,
): void {
  const cfg = readConfigFile({ profile, kind: "installed" });
  const wizardFlag = expected === "server" ? "--setup-server" : "--setup-client";
  if (cfg && cfg.role !== expected) {
    throw new CliError(
      `Profile "${profile}" already exists as a ${cfg.role} profile. ` +
        `Role is immutable — choose a different --profile name, or delete ` +
        `~/.taskmanager/profiles/${profile} and re-run ${wizardFlag}.`,
      2,
      { code: CLI_ERR.invalidArgs, role: cfg.role, profile },
    );
  }
  if (rerun && !cfg) {
    throw new CliError(
      `Profile "${profile}" has no config to re-run — use ${wizardFlag} to create it.`,
      2,
      { code: CLI_ERR.invalidArgs, profile },
    );
  }
}

function resolveServerProfileDefaults(profile: string): Required<
  Pick<CliConfigFile, "port" | "data_dir" | "open_browser" | "role">
> {
  const configScope = { profile, kind: "installed" as const };
  const existing: Partial<CliConfigFile> = readConfigFile(configScope) ?? {};
  return {
    role: "server",
    port: existing.port ?? INSTALLED_DEFAULT_PORT,
    data_dir: path.resolve(
      existing.data_dir ?? getDefaultInstalledDataDir(configScope),
    ),
    open_browser: existing.open_browser ?? true,
  };
}

/**
 * Bridge readline's auto-installed SIGINT handler into our launcher-level
 * gate (sigintGate.ts). Without this re-emit, readline swallows Ctrl+C and
 * the gate never sees the signal during a prompt — so the first press would
 * appear to do nothing (the original silent-exit bug). Returns a cleanup
 * function caller MUST run before closing the rl interface.
 */
function forwardReadlineSigint(rl: ReadlineInterface): () => void {
  const onRlSigint = (): void => {
    // Re-emit on the process so the launcher's installSigintGate handler
    // runs. We do not close `rl` here: the user may want to keep typing
    // their answer after a single Ctrl+C (the gate prints a warning and
    // waits for a second press to abort).
    process.emit("SIGINT");
  };
  rl.on("SIGINT", onRlSigint);
  return () => rl.off("SIGINT", onRlSigint);
}

interface PromptHooks {
  progress?: SetupProgress;
  /** Short, human-readable label used when reporting "Waiting on: <label>". */
  label?: string;
}

async function promptWithDefault(
  question: string,
  defaultValue: string,
  hooks: PromptHooks = {},
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const removeSigintForward = forwardReadlineSigint(rl);
  if (hooks.label) hooks.progress?.setCurrentPromptLabel(hooks.label);
  try {
    const answer = await rl.question(`${question} `);
    return answer.trim() || defaultValue;
  } finally {
    removeSigintForward();
    hooks.progress?.setCurrentPromptLabel(null);
    rl.close();
  }
}

async function promptBoolean(
  question: string,
  defaultValue: boolean,
  hooks: PromptHooks = {},
): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const removeSigintForward = forwardReadlineSigint(rl);
  if (hooks.label) hooks.progress?.setCurrentPromptLabel(hooks.label);
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
    removeSigintForward();
    hooks.progress?.setCurrentPromptLabel(null);
    rl.close();
  }
}

/**
 * Prompt for a value with validation, re-prompting on bad input. Mirrors
 * `promptBoolean`'s loop-until-valid pattern (issue #31343: previously a single
 * typo in the api_url/api_key prompt threw and exited the wizard, forcing the
 * operator to restart `--setup-client` from scratch).
 *
 * - On empty input, falls back to `defaultValue` (which is itself fed through
 *   `validate`, so a blank default like "" is rejected naturally).
 * - On `CliError` from `validate`, prints the message and re-prompts. No retry
 *   cap — Ctrl+C is the user's exit. Other errors propagate.
 * - On EOF / closed stdin (no human to retry), throws once instead of looping
 *   forever.
 */
async function promptValidatedWithDefault<T>(
  question: string,
  defaultValue: string,
  validate: (raw: string) => T,
  hooks: PromptHooks = {},
): Promise<T> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const removeSigintForward = forwardReadlineSigint(rl);
  if (hooks.label) hooks.progress?.setCurrentPromptLabel(hooks.label);
  try {
    for (;;) {
      let answer: string;
      try {
        answer = await rl.question(`${question} `);
      } catch {
        throw new CliError(
          "Setup aborted: stdin closed before a valid value was provided.",
          2,
          { code: CLI_ERR.invalidArgs },
        );
      }
      const raw = answer.trim() || defaultValue;
      try {
        return validate(raw);
      } catch (err) {
        if (err instanceof CliError) {
          console.log(err.message);
          continue;
        }
        throw err;
      }
    }
  } finally {
    removeSigintForward();
    hooks.progress?.setCurrentPromptLabel(null);
    rl.close();
  }
}

/**
 * Result of the client-wizard connectivity probe. `kind` drives the actionable
 * hint shown to the operator (issue #8 follow-up: the previous code just
 * printed `{"running":false}` with no guidance).
 */
type ClientProbeResult =
  | { kind: "ok"; status: number }
  | { kind: "auth_required"; status: number }
  | { kind: "auth_invalid"; status: number }
  | { kind: "setup_required"; status: number }
  | { kind: "http_error"; status: number; body: string }
  | { kind: "tls_error"; message: string }
  | { kind: "dns_error"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "network_error"; message: string };

const CLIENT_PROBE_TIMEOUT_MS = 5000;

async function probeClientServer(
  apiUrl: string,
  apiKey: string,
): Promise<ClientProbeResult> {
  const url = `${apiUrl.replace(/\/+$/, "")}/api/health`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(CLIENT_PROBE_TIMEOUT_MS),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const lower = message.toLowerCase();
    if (
      cause instanceof Error &&
      (cause.name === "AbortError" || cause.name === "TimeoutError")
    ) {
      return { kind: "timeout", message };
    }
    if (
      lower.includes("certificate") ||
      lower.includes("self-signed") ||
      lower.includes("self signed") ||
      lower.includes("ssl") ||
      lower.includes("tls") ||
      lower.includes("unable to verify the first certificate")
    ) {
      return { kind: "tls_error", message };
    }
    if (
      lower.includes("enotfound") ||
      lower.includes("eai_again") ||
      lower.includes("getaddrinfo") ||
      lower.includes("dns")
    ) {
      return { kind: "dns_error", message };
    }
    return { kind: "network_error", message };
  }

  if (response.ok) {
    return { kind: "ok", status: response.status };
  }
  // Match the JSON error codes emitted by authMiddleware (see src/server/auth.ts).
  let body: { code?: string } = {};
  let bodyText = "";
  try {
    bodyText = await response.text();
    if (bodyText.trim().startsWith("{")) {
      body = JSON.parse(bodyText) as { code?: string };
    }
  } catch {
    // Non-JSON body: fall through to http_error.
  }
  if (response.status === 401 && body.code === "auth_cli_key_required") {
    return { kind: "auth_required", status: response.status };
  }
  if (response.status === 401 && body.code === "auth_invalid_cli_key") {
    return { kind: "auth_invalid", status: response.status };
  }
  if (response.status === 503 && body.code === "auth_setup_required") {
    return { kind: "setup_required", status: response.status };
  }
  return { kind: "http_error", status: response.status, body: bodyText };
}

function describeClientProbe(
  result: ClientProbeResult,
  apiUrl: string,
): { ok: boolean; lines: string[] } {
  switch (result.kind) {
    case "ok":
      return {
        ok: true,
        lines: [`Connected to ${apiUrl} (HTTP ${result.status}).`],
      };
    case "auth_required":
      return {
        ok: false,
        lines: [
          `Server replied 401 auth_cli_key_required at ${apiUrl}.`,
          "Hint: the server requires a CLI API key but none was sent.",
          "Verify the api_key in this profile and that it was generated on the same server (hirotaskmanager server api-key generate).",
        ],
      };
    case "auth_invalid":
      return {
        ok: false,
        lines: [
          `Server replied 401 auth_invalid_cli_key at ${apiUrl}.`,
          "Hint: the api_key does not match any active key on the server.",
          "Possible causes: typo, truncated paste, key revoked, or pasted from a different server.",
          "Re-generate on the server: hirotaskmanager server api-key generate",
        ],
      };
    case "setup_required":
      return {
        ok: false,
        lines: [
          `Server replied 503 auth_setup_required at ${apiUrl}.`,
          "Hint: the remote server has no web passphrase set yet.",
          `Open ${apiUrl} in a browser on the server side and complete first-run setup.`,
        ],
      };
    case "http_error":
      return {
        ok: false,
        lines: [
          `Server replied HTTP ${result.status} at ${apiUrl}.`,
          result.body ? `Body: ${result.body.slice(0, 200)}` : "(empty body)",
          "Hint: check that api_url points at the TaskManager server and that any reverse proxy (Caddy/nginx) is forwarding /api/* unchanged.",
        ],
      };
    case "tls_error":
      return {
        ok: false,
        lines: [
          `TLS error reaching ${apiUrl}: ${result.message}`,
          "Hint: certificate may be self-signed, expired, or for a different hostname.",
          "If you control the server, ensure the reverse proxy (Caddy/nginx) provisioned a valid cert for this hostname.",
        ],
      };
    case "dns_error":
      return {
        ok: false,
        lines: [
          `DNS resolution failed for ${apiUrl}: ${result.message}`,
          "Hint: check the hostname spelling and that the domain points at the server.",
        ],
      };
    case "timeout":
      return {
        ok: false,
        lines: [
          `Request timed out after ${CLIENT_PROBE_TIMEOUT_MS}ms reaching ${apiUrl}.`,
          "Hint: the server may be down, behind a firewall, or unreachable from this network.",
        ],
      };
    case "network_error":
      return {
        ok: false,
        lines: [
          `Network error reaching ${apiUrl}: ${result.message}`,
          "Hint: verify the URL is correct and that the server is running and reachable.",
        ],
      };
  }
}

function isLoopbackUrlHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export function normalizeClientApiUrl(raw: string): string {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    // issue #31343: bare hostnames (e.g. "tm.example.com") are the most common
    // mistake. Collapse the two separate "not a URL" / "missing scheme" errors
    // into one actionable message that tells the operator exactly what to type.
    throw new CliError(
      `Invalid api_url: "${trimmed}" is not a valid URL. ` +
        "Enter the full URL including http:// or https://, " +
        "e.g. https://tm.example.com",
      2,
      { code: CLI_ERR.invalidValue, field: "api_url" },
    );
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new CliError(
      `Invalid api_url: "${trimmed}" must start with http:// or https://`,
      2,
      { code: CLI_ERR.invalidValue, field: "api_url" },
    );
  }
  if (u.protocol === "http:" && !isLoopbackUrlHost(u.hostname)) {
    console.warn(
      "[taskmanager] Warning: http:// with a non-loopback host sends traffic in cleartext; prefer https:// for remote servers.",
    );
  }
  return trimmed.replace(/\/+$/, "");
}

/**
 * Validate a CLI API key pasted into the setup wizard. Trim only; no quote or
 * `Bearer ` stripping (issue #31343: keep the contract strict so the operator
 * pastes exactly what `hirotaskmanager server api-key generate` printed).
 * Reuses `isWellFormedCliApiKey` so the wizard and `runtimeConfig` agree on
 * the shape (common-code rule).
 */
export function validateCliApiKeyInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new CliError(
      "api_key is required. Paste the key printed by " +
        "'hirotaskmanager server api-key generate' on the server.",
      2,
      { code: CLI_ERR.missingRequired, field: "api_key" },
    );
  }
  if (!isWellFormedCliApiKey(trimmed)) {
    throw new CliError(
      "api_key looks malformed: expected `tmk-` followed by 64 hex chars. " +
        "Re-generate on the server with `hirotaskmanager server api-key generate`.",
      2,
      { code: CLI_ERR.invalidValue, field: "api_key" },
    );
  }
  return trimmed;
}

/**
 * Plain `hirotaskmanager` with no profile config: ask server vs client (design §2.8).
 */
export async function chooseSetupModeInteractive(
  progress?: SetupProgress,
): Promise<"server" | "client"> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const removeSigintForward = forwardReadlineSigint(rl);
  progress?.setCurrentPromptLabel("server vs client choice");
  try {
    console.log(`How will this machine use TaskManager?
  [s] server  — run the API + database on this machine
  [c] client  — CLI only; connect to a remote server elsewhere`);
    for (;;) {
      const answer = (await rl.question("Choice [s/c]: ")).trim().toLowerCase();
      if (answer === "s" || answer === "server") return "server";
      if (answer === "c" || answer === "client") return "client";
      console.log('Please enter "s" for server or "c" for client.');
    }
  } finally {
    removeSigintForward();
    progress?.setCurrentPromptLabel(null);
    rl.close();
  }
}

export async function runServerSetupWizard(options: {
  profile: string;
  rerun: boolean;
  progress?: SetupProgress;
}): Promise<LauncherSetupResult> {
  const machineHadNoProfilesBefore = !hasAnyProfileConfigOnDisk();
  let activeProfile = options.profile;
  const progress = options.progress;
  // Server wizard implies the role even when invoked directly via
  // --setup-server (i.e. without going through chooseSetupModeInteractive),
  // so register it up front for the abort report.
  progress?.setRole("server");
  progress?.setProfileName(activeProfile);

  if (options.rerun && !canPromptInteractively()) {
    throw new CliError(
      "Re-run setup requires an interactive terminal (TTY).",
      2,
      { code: CLI_ERR.invalidArgs },
    );
  }

  assertRoleAllowsWizard(activeProfile, "server", options.rerun);

  if (!canPromptInteractively()) {
    const defaults = resolveServerProfileDefaults(activeProfile);
    const existing: Partial<CliConfigFile> =
      readConfigFile({ profile: activeProfile, kind: "installed" }) ?? {};
    const bind = existing.bind_address ?? DEFAULT_BIND_ADDRESS;
    const config: CliConfigFile = {
      ...defaults,
      ...existing,
      role: "server",
      bind_address: bind,
    };
    if (!isLoopbackBindAddress(bind)) {
      config.require_cli_api_key = true;
    } else if (existing.require_cli_api_key === true) {
      config.require_cli_api_key = true;
    } else {
      delete config.require_cli_api_key;
    }
    writeConfigFile(config, { profile: activeProfile, kind: "installed" });
    ensureRuntimeDirectories({ profile: activeProfile, kind: "installed" });

    // Non-TTY auto-mint: when require_cli_api_key is true (either forced by a
    // non-loopback bind or carried from an existing config), the local CLI
    // will be unable to call its own server until a key exists. Without a TTY
    // we cannot ask "mint now?" — but leaving the operator with an
    // unreachable server is worse than minting a default key and printing it
    // to stdout. Skip if the operator already provided api_key explicitly.
    let nextConfig: CliConfigFile = config;
    if (config.require_cli_api_key === true && !existing.api_key) {
      const authDir = resolveAuthDir({
        profile: activeProfile,
        kind: "installed",
      });
      const { key } = await generateCliApiKey({
        authDir,
        label: `setup-noninteractive-${path.basename(activeProfile)}`,
      });
      nextConfig = { ...config, api_key: key };
      writeConfigFile(nextConfig, {
        profile: activeProfile,
        kind: "installed",
      });
      // Non-interactive output (CI, ansible, packer) must stay pipe-friendly:
      // print the key on its own line in a plain unboxed format so capture
      // and grep keep working. The key is also persisted to the profile so
      // the local CLI works immediately.
      printCliApiKey(key, {
        profileName: activeProfile,
        nonInteractive: true,
      });
    }

    return {
      config: nextConfig,
      profileName: activeProfile,
      setupMeta: {
        justFinishedInteractiveSetup: false,
        firstProfileOnMachine: machineHadNoProfilesBefore,
        shouldStartLocalServer: true,
      },
    };
  }

  if (!options.rerun) {
    printInteractiveSetupHeader({
      profileName: activeProfile,
      firstProfileOnMachine: machineHadNoProfilesBefore,
    });
    await spinForMoment(
      "Looking for existing profiles...",
      machineHadNoProfilesBefore
        ? `Creating profile: ${activeProfile}`
        : `Using profile: ${activeProfile}`,
    );
    const nameAns = await promptWithDefault(
      formatTextPrompt("Profile name", activeProfile),
      activeProfile,
      { progress, label: "Profile name" },
    );
    const trimmed = nameAns.trim();
    if (trimmed) {
      activeProfile = trimmed;
      progress?.setProfileName(activeProfile);
    }
  } else {
    printInteractiveSetupHeader({
      profileName: activeProfile,
      firstProfileOnMachine: false,
    });
    await spinForMoment("Loading current server profile...", activeProfile);
  }

  const defaults = resolveServerProfileDefaults(activeProfile);
  const existing: Partial<CliConfigFile> =
    readConfigFile({ profile: activeProfile, kind: "installed" }) ?? {};

  const portValue = await promptWithDefault(
    formatTextPrompt("Pick a port for web/api", String(existing.port ?? defaults.port)),
    String(existing.port ?? defaults.port),
    { progress, label: "Port for web/api" },
  );

  const dataDirValue = await promptWithDefault(
    formatTextPrompt(
      "Pick a data directory for the database",
      String(existing.data_dir ?? defaults.data_dir),
    ),
    String(existing.data_dir ?? defaults.data_dir),
    { progress, label: "Data directory" },
  );

  // Auth dir is no longer prompted — it always lives at <profileRoot>/auth.
  // Removed because the only contents (web passphrase hash + CLI key hashes)
  // gain nothing from being on a separate volume, and a shared auth_dir
  // across profiles would silently share credentials.

  // Renamed from the original "Allow remote access?" — that wording made
  // operators assume "Yes = my server is reachable remotely" (which it always
  // is, via a reverse proxy), when the toggle actually controls whether the
  // raw API socket is bound to a public interface. The new wording asks the
  // outcome plainly, and the explanatory line printed after the answer points
  // operators at the reverse-proxy alternative.
  const acceptRemoteDirect = await promptBoolean(
    formatBooleanPrompt(
      "Should this server accept connections from other machines on the network?",
      !!(existing.bind_address && !isLoopbackBindAddress(existing.bind_address)),
    ),
    !!(existing.bind_address && !isLoopbackBindAddress(existing.bind_address)),
    { progress, label: "Accept remote connections?" },
  );

  const bindAddress = acceptRemoteDirect ? "0.0.0.0" : DEFAULT_BIND_ADDRESS;

  let requireCliApiKey: boolean;
  if (acceptRemoteDirect) {
    requireCliApiKey = true;
    console.log(
      "  -> The API will accept connections from any network interface (0.0.0.0). A CLI API key will be required.",
    );
  } else {
    console.log(
      "  -> The API will only accept connections from this machine (127.0.0.1). Use a reverse proxy (Caddy, nginx, etc.) to expose it remotely.",
    );
    requireCliApiKey = await promptBoolean(
      formatBooleanPrompt(
        "Require a CLI API key for local connections too?",
        existing.require_cli_api_key === true,
      ),
      existing.require_cli_api_key === true,
      { progress, label: "Require CLI API key locally?" },
    );
  }

  const defaultOpenBrowser =
    process.stdout.isTTY && !process.env.SSH_CONNECTION;
  const openBrowser = await promptBoolean(
    formatBooleanPrompt(
      "Open the default browser when starting the server via hirotaskmanager",
      existing.open_browser ?? defaultOpenBrowser,
    ),
    existing.open_browser ?? defaultOpenBrowser,
    { progress, label: "Open browser on start?" },
  );

  const config: CliConfigFile = {
    ...existing,
    role: "server",
    port: parsePortOption(portValue) ?? defaults.port,
    data_dir: path.resolve(dataDirValue),
    open_browser: openBrowser,
    bind_address: bindAddress,
  };
  if (requireCliApiKey) {
    config.require_cli_api_key = true;
  } else {
    delete config.require_cli_api_key;
  }

  writeConfigFile(config, { profile: activeProfile, kind: "installed" });
  ensureRuntimeDirectories({ profile: activeProfile, kind: "installed" });
  progress?.mark("profile_written");

  await spinForMoment(
    machineHadNoProfilesBefore
      ? `Saving profile: ${activeProfile}`
      : `Updating profile: ${activeProfile}`,
    `Saved ${activeProfile}`,
  );

  const authDirResolved = resolveAuthDir({
    profile: activeProfile,
    kind: "installed",
  });
  const needsKeyByPolicy = resolveRequireCliApiKey({
    profile: activeProfile,
    kind: "installed",
  });

  let nextConfig: CliConfigFile = config;
  // Always offer the mint prompt on a fresh server profile, regardless of the
  // require_cli_api_key policy — discoverability fix: a loopback-only server
  // with the policy off still benefits from having a key for any future remote
  // client (another laptop, agent, tunnel). Default tracks the policy: Y when
  // the server *requires* a key (no key = unreachable), N when it doesn't
  // (operator already said "no auth needed locally"). Skip entirely when the
  // profile already carries an api_key so a re-run never overwrites a key the
  // operator pasted in elsewhere.
  if (!existing.api_key) {
    const mintPromptText = needsKeyByPolicy
      ? "Mint a CLI API key now? The server requires one for any client to connect"
      : "Mint a CLI API key now? Not needed for local CLI use, but required for any remote client (another machine, agent, browser-less tool)";
    const mint = await promptBoolean(
      formatBooleanPrompt(mintPromptText, needsKeyByPolicy),
      needsKeyByPolicy,
      { progress, label: "Mint CLI API key?" },
    );
    if (mint) {
      const { key } = await generateCliApiKey({
        authDir: authDirResolved,
        label: `setup-${path.basename(activeProfile)}`,
      });
      // Boxed, color-emphasised display so the one-time key is not lost in
      // the surrounding wizard output (#31342).
      printCliApiKey(key, { profileName: activeProfile });
      nextConfig = { ...config, api_key: key };
      writeConfigFile(nextConfig, { profile: activeProfile, kind: "installed" });
      progress?.mark("api_key_minted");
    } else {
      // Closes the discoverability gap when the operator declines: print the
      // exact day-2 command so they don't have to dig through docs to mint
      // one later. Mirrors the operator-only command listed in AGENTS.md.
      console.log(
        "No CLI API key minted. To create one later, run:",
      );
      console.log(
        `  hirotaskmanager server api-key generate --label "<name>" --profile ${activeProfile}`,
      );
    }
  }

  const previousDefault = resolveDefaultProfileName();
  const hasPointer = !!previousDefault;
  const setDefault = await promptBoolean(
    formatBooleanPrompt(
      "Set this profile as the default for hirotm (no --profile needed)",
      !hasPointer,
    ),
    !hasPointer,
    { progress, label: "Set as default profile?" },
  );
  if (setDefault) {
    writeDefaultProfileName(activeProfile);
    progress?.mark("default_pointer_set");
    // Make a default-profile change visible: agents and humans rely on
    // `hirotm` (no --profile) routing to the right server, and silently
    // retargeting from one profile to another is easy to miss.
    if (previousDefault && previousDefault !== activeProfile) {
      console.log(
        `Default profile changed: ${previousDefault} -> ${activeProfile}. ` +
          `Commands run as plain \`hirotm\` now target this profile.`,
      );
    } else if (!previousDefault) {
      console.log(
        `Default profile set to "${activeProfile}". ` +
          `Plain \`hirotm\` commands now use this profile.`,
      );
    }
  }

  const startAfter = await promptBoolean(
    formatBooleanPrompt("Start the server now", true),
    true,
    { progress, label: "Start server now?" },
  );

  printSavedProfileSummary({
    created: machineHadNoProfilesBefore,
    profileName: activeProfile,
    appUrl: buildLocalServerUrl(nextConfig.port!),
    dataDir: path.resolve(nextConfig.data_dir!),
    openBrowser,
    bindAddress: nextConfig.bind_address,
  });

  return {
    config: nextConfig,
    profileName: activeProfile,
    setupMeta: {
      justFinishedInteractiveSetup: true,
      firstProfileOnMachine: machineHadNoProfilesBefore,
      shouldStartLocalServer: startAfter,
    },
  };
}

export async function runClientSetupWizard(options: {
  profile: string;
  rerun: boolean;
  progress?: SetupProgress;
}): Promise<LauncherSetupResult> {
  if (!canPromptInteractively()) {
    throw new CliError(
      "Client setup needs interactive prompts for api_url and api_key. Open a terminal and run: hirotaskmanager --setup-client",
      2,
      { code: CLI_ERR.invalidArgs },
    );
  }

  assertRoleAllowsWizard(options.profile, "client", options.rerun);

  const machineHadNoProfilesBefore = !hasAnyProfileConfigOnDisk();
  let activeProfile = options.profile;
  const progress = options.progress;
  // Same rationale as the server wizard: register role + profile up front so
  // an interrupt at the very first prompt still produces a meaningful abort
  // report (see setupProgress.describeSetupAbort).
  progress?.setRole("client");
  progress?.setProfileName(activeProfile);

  printInteractiveSetupHeader({
    profileName: activeProfile,
    firstProfileOnMachine: machineHadNoProfilesBefore,
  });

  if (!options.rerun) {
    const defaultName = activeProfile === "default" ? "remote" : activeProfile;
    const nameAns = await promptWithDefault(
      formatTextPrompt("Profile name", defaultName),
      defaultName,
      { progress, label: "Profile name" },
    );
    const trimmed = nameAns.trim();
    if (trimmed) {
      activeProfile = trimmed;
      progress?.setProfileName(activeProfile);
    }
  }

  const existingClient: Partial<CliConfigFile> =
    readConfigFile({ profile: activeProfile, kind: "installed" }) ?? {};

  // issue #31343: previously this prompt showed `[https://]` as a fake default
  // (which is itself not a valid URL) and exited the whole wizard on the first
  // typo. Now: only show a default when re-running over an existing profile,
  // and re-prompt on validation failure.
  const apiUrlPrompt = existingClient.api_url
    ? formatTextPrompt(
        "Server base URL (api_url)",
        String(existingClient.api_url),
      )
    : "Server base URL (api_url, e.g. https://tm.example.com):";
  const apiUrl = await promptValidatedWithDefault(
    apiUrlPrompt,
    String(existingClient.api_url ?? ""),
    normalizeClientApiUrl,
    { progress, label: "Server base URL (api_url)" },
  );

  // Same retry treatment for the api_key prompt: a paste mistake should not
  // kill the wizard. Validation lives in `validateCliApiKeyInput`.
  const apiKeyPrompt = existingClient.api_key
    ? formatTextPrompt(
        "CLI API key (from the server: hirotaskmanager server api-key generate)",
        String(existingClient.api_key),
      )
    : "CLI API key (from the server: hirotaskmanager server api-key generate):";
  const apiKeyTrimmed = await promptValidatedWithDefault(
    apiKeyPrompt,
    String(existingClient.api_key ?? ""),
    validateCliApiKeyInput,
    { progress, label: "CLI API key" },
  );

  const config: CliConfigFile = {
    role: "client",
    api_url: apiUrl,
    api_key: apiKeyTrimmed,
  };

  writeConfigFile(config, { profile: activeProfile, kind: "installed" });
  progress?.mark("profile_written");

  const previousDefault = resolveDefaultProfileName();
  const hasPointer = !!previousDefault;
  const setDefault = await promptBoolean(
    formatBooleanPrompt(
      "Set this profile as the default for hirotm (no --profile needed)",
      !hasPointer,
    ),
    !hasPointer,
    { progress, label: "Set as default profile?" },
  );
  if (setDefault) {
    writeDefaultProfileName(activeProfile);
    progress?.mark("default_pointer_set");
    // Same surface as the server wizard: switching the default away from a
    // local server profile to a remote client profile retargets `hirotm`
    // silently otherwise.
    if (previousDefault && previousDefault !== activeProfile) {
      console.log(
        `Default profile changed: ${previousDefault} -> ${activeProfile}. ` +
          `Commands run as plain \`hirotm\` now target this remote server.`,
      );
    } else if (!previousDefault) {
      console.log(
        `Default profile set to "${activeProfile}". ` +
          `Plain \`hirotm\` commands now use this profile.`,
      );
    }
  }

  console.log("\nChecking connectivity to the server...\n");
  // Probe the server directly with the configured key so we can give an
  // actionable hint per failure mode (auth, TLS, DNS, etc.) instead of the
  // previous silent {"running":false} dump (issue #8 follow-up).
  const probe = await probeClientServer(apiUrl, apiKeyTrimmed);
  const described = describeClientProbe(probe, apiUrl);
  for (const line of described.lines) {
    console.log(line);
  }
  if (!described.ok) {
    console.log(
      "\nThe profile was saved, but the server is not reachable yet. " +
        "Fix the issue above and re-run: hirotaskmanager --setup --profile " +
        activeProfile,
    );
  }

  return {
    config,
    profileName: activeProfile,
    setupMeta: {
      justFinishedInteractiveSetup: true,
      firstProfileOnMachine: machineHadNoProfilesBefore,
      shouldStartLocalServer: false,
    },
  };
}
