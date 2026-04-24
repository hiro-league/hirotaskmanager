/**
 * Phase 6: interactive setup flows for server and client profiles (design §2.8).
 * Initial development: no backward compatibility with pre-role profiles.
 *
 * All operator-facing prompts route through @inquirer/prompts (arrow-key
 * select for finite choices, inline input with [default] hint for free text).
 * The three local helpers below are thin adapters that preserve our
 * SetupProgress label hooks and SIGINT bridging — call sites stay identical
 * to the prior readline-based version.
 */
import path from "node:path";
import process from "node:process";
import { input, select } from "@inquirer/prompts";
import { ansi, colorEnabled } from "../../shared/terminalColors";
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
import { resolvePersistedServerSetupStateForConfigWrite } from "../../shared/serverSetupLifecycle";
import { CliError } from "../lib/output/output";
import {
  printCliApiKey,
  printInteractiveSetupHeader,
  printSavedProfileSummary,
  spinForMoment,
} from "../lib/output/launcherUi";

export interface LauncherSetupMeta {
  justFinishedInteractiveSetup: boolean;
  firstProfileOnMachine: boolean;
  /**
   * Server wizard always continues into the installed-server bootstrap path.
   * Client wizard never starts a local Bun server — only this case is false.
   */
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

interface PromptHooks {
  progress?: SetupProgress;
  /** Short, human-readable label used when reporting "Waiting on: <label>". */
  label?: string;
}

/**
 * Shared Inquirer theme for every wizard prompt. Two operator-visible tweaks
 * over the library default:
 *   - Done-state prefix uses bold green to match `paintSuccess` (the same
 *     green as "Profile Saved:" / "Profile Created:") instead of the default
 *     theme's check, which renders as a violet/blue glyph in some terminals.
 *   - A trailing space inside the prefix string adds breathing room between
 *     the glyph and the message — Inquirer concatenates `${prefix}${message}`
 *     verbatim, so the gap has to live in the prefix itself.
 * Honours NO_COLOR / non-TTY via `colorEnabled` so piped output stays clean.
 */
const wizardPromptTheme = {
  prefix: {
    idle: colorEnabled(process.stdout)
      ? `${ansi.bold}${ansi.cyan}?${ansi.reset} `
      : "? ",
    done: colorEnabled(process.stdout)
      ? `${ansi.bold}${ansi.green}\u2714${ansi.reset} `
      : "\u2714 ",
  },
} as const;

/**
 * Inquirer throws an ExitPromptError when the user presses Ctrl+C inside any
 * of its prompts. We intercept that, re-emit SIGINT so the launcher-level
 * gate (sigintGate.ts) sees the signal and runs its two-press abort UX, and
 * re-throw so the wizard unwinds — same observable behavior as the prior
 * readline-based bridge, just routed through Inquirer's lifecycle.
 */
function bridgeInquirerExit(err: unknown): never {
  process.emit("SIGINT");
  throw err;
}

function isInquirerExitError(err: unknown): boolean {
  return err instanceof Error && err.name === "ExitPromptError";
}

function isInquirerNonTtyError(err: unknown): boolean {
  return err instanceof Error && err.name === "NonTtyError";
}

/**
 * Translate Inquirer's NonTtyError into a CLI-shaped error so the wizard
 * surfaces a single, actionable failure when stdin/stdout aren't a real TTY
 * (CI, piped input, `ssh host cmd` without -t). We require interactivity
 * everywhere the wizard prompts: there's no plain-readline fallback.
 */
function rethrowAsNonTtyCliError(label: string | undefined): never {
  const where = label ? ` (waiting on: ${label})` : "";
  throw new CliError(
    `Setup needs an interactive terminal${where}. ` +
      "Run hirotaskmanager from a real terminal, or use `ssh -t` for remote sessions.",
    2,
    { code: CLI_ERR.invalidArgs },
  );
}

async function promptWithDefault(
  question: string,
  defaultValue: string,
  hooks: PromptHooks = {},
): Promise<string> {
  if (hooks.label) hooks.progress?.setCurrentPromptLabel(hooks.label);
  try {
    const answer = await input({
      message: question,
      default: defaultValue,
      theme: wizardPromptTheme,
    });
    return answer.trim() || defaultValue;
  } catch (err) {
    if (isInquirerNonTtyError(err)) rethrowAsNonTtyCliError(hooks.label);
    if (isInquirerExitError(err)) bridgeInquirerExit(err);
    throw err;
  } finally {
    hooks.progress?.setCurrentPromptLabel(null);
  }
}

async function promptBoolean(
  question: string,
  defaultValue: boolean,
  hooks: PromptHooks = {},
): Promise<boolean> {
  if (hooks.label) hooks.progress?.setCurrentPromptLabel(hooks.label);
  try {
    // `select` over `confirm` so the user sees both options as a list and
    // arrow-keys between them, with the default visibly highlighted. Matches
    // the operator request: "selection instead of text input, default
    // selected but user can change it."
    const choice = await select<"yes" | "no">({
      message: question,
      choices: [
        { name: "Yes", value: "yes" },
        { name: "No", value: "no" },
      ],
      default: defaultValue ? "yes" : "no",
      theme: wizardPromptTheme,
    });
    return choice === "yes";
  } catch (err) {
    if (isInquirerNonTtyError(err)) rethrowAsNonTtyCliError(hooks.label);
    if (isInquirerExitError(err)) bridgeInquirerExit(err);
    throw err;
  } finally {
    hooks.progress?.setCurrentPromptLabel(null);
  }
}

/**
 * Prompt for a value with validation, re-prompting on bad input. Mirrors
 * the previous loop-until-valid pattern (issue #31343: previously a single
 * typo in the api_url/api_key prompt threw and exited the wizard, forcing the
 * operator to restart `--setup-client` from scratch).
 *
 * - On empty input, falls back to `defaultValue` (which is itself fed through
 *   `validate`, so a blank default like "" is rejected naturally).
 * - On `CliError` from `validate`, the message becomes Inquirer's inline
 *   validation hint and the prompt re-renders for another attempt. No retry
 *   cap — Ctrl+C is the user's exit.
 * - On EOF / closed stdin (no human to retry), throws once via the non-TTY
 *   bridge instead of looping forever.
 */
async function promptValidatedWithDefault<T>(
  question: string,
  defaultValue: string,
  validate: (raw: string) => T,
  hooks: PromptHooks = {},
): Promise<T> {
  if (hooks.label) hooks.progress?.setCurrentPromptLabel(hooks.label);
  try {
    const raw = await input({
      message: question,
      default: defaultValue || undefined,
      theme: wizardPromptTheme,
      validate: (value: string): true | string => {
        const candidate = value.trim() || defaultValue;
        try {
          validate(candidate);
          return true;
        } catch (vErr) {
          if (vErr instanceof CliError) return vErr.message;
          throw vErr;
        }
      },
    });
    // Validator above already proved this passes; re-run to obtain the
    // normalized return value (e.g. trimmed URL, parsed key).
    return validate(raw.trim() || defaultValue);
  } catch (err) {
    if (isInquirerNonTtyError(err)) rethrowAsNonTtyCliError(hooks.label);
    if (isInquirerExitError(err)) bridgeInquirerExit(err);
    throw err;
  } finally {
    hooks.progress?.setCurrentPromptLabel(null);
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
  progress?.setCurrentPromptLabel("server vs client choice");
  try {
    return await select<"server" | "client">({
      message: "How will this machine use TaskManager?",
      choices: [
        {
          name: "Server — run the API + database on this machine",
          value: "server",
        },
        {
          name: "Client — CLI only; connect to a remote server elsewhere",
          value: "client",
        },
      ],
      default: "server",
      theme: wizardPromptTheme,
    });
  } catch (err) {
    if (isInquirerNonTtyError(err)) {
      rethrowAsNonTtyCliError("server vs client choice");
    }
    if (isInquirerExitError(err)) bridgeInquirerExit(err);
    throw err;
  } finally {
    progress?.setCurrentPromptLabel(null);
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
    const authDirNonInteractive = resolveAuthDir({
      profile: activeProfile,
      kind: "installed",
    });
    const config: CliConfigFile = {
      ...defaults,
      ...existing,
      role: "server",
      bind_address: bind,
      server_setup_state: resolvePersistedServerSetupStateForConfigWrite(
        existing.server_setup_state,
        authDirNonInteractive,
      ),
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
      "Profile name",
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
    "Pick a port for web/api",
    String(existing.port ?? defaults.port),
    { progress, label: "Port for web/api" },
  );

  const dataDirValue = await promptWithDefault(
    "Pick a data directory for the database",
    String(existing.data_dir ?? defaults.data_dir),
    { progress, label: "Data directory" },
  );

  // Auth dir is no longer prompted — it always lives at <profileRoot>/auth.
  // Removed because the only contents (web passphrase hash + CLI key hashes)
  // gain nothing from being on a separate volume, and a shared auth_dir
  // across profiles would silently share credentials.

  // bind_address is treated as an advanced, config-file-only setting: new
  // profiles always default to loopback, and re-runs preserve whatever an
  // operator hand-edited into config.json (validated at load time in
  // runtimeConfig.ts — non-loopback already requires require_cli_api_key:true,
  // so silent preservation cannot open an unauth public socket).
  const bindAddress = existing.bind_address ?? DEFAULT_BIND_ADDRESS;
  const isNonLoopbackBind = !isLoopbackBindAddress(bindAddress);

  let requireCliApiKey: boolean;
  if (isNonLoopbackBind) {
    // Hand-edited public bind: require_cli_api_key MUST be true (config
    // validator enforces this); skip the prompt so we do not offer the
    // operator a footgun answer the validator would reject anyway.
    requireCliApiKey = true;
  } else {
    requireCliApiKey = await promptBoolean(
      "Require a CLI API key for local connections too?",
      existing.require_cli_api_key === true,
      { progress, label: "Require CLI API key locally?" },
    );
  }

  const defaultOpenBrowser =
    process.stdout.isTTY && !process.env.SSH_CONNECTION;
  const openBrowser = await promptBoolean(
    "Open the default browser when starting the server via hirotaskmanager",
    existing.open_browser ?? defaultOpenBrowser,
    { progress, label: "Open browser on start?" },
  );

  const authDirResolved = resolveAuthDir({
    profile: activeProfile,
    kind: "installed",
  });

  const config: CliConfigFile = {
    ...existing,
    role: "server",
    port: parsePortOption(portValue) ?? defaults.port,
    data_dir: path.resolve(dataDirValue),
    open_browser: openBrowser,
    bind_address: bindAddress,
    server_setup_state: resolvePersistedServerSetupStateForConfigWrite(
      existing.server_setup_state,
      authDirResolved,
    ),
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
      : "Mint a CLI API key now? Required for remote CLI clients";
    const mint = await promptBoolean(
      mintPromptText,
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
    "Set this profile as the default for hirotm (no --profile needed)",
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

  // No "start server later" option: the launcher always continues into first-time
  // bootstrap so mint/setup token + recovery use one path (server_setup_state).

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
      shouldStartLocalServer: true,
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
      "Profile name",
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
  const apiUrl = await promptValidatedWithDefault(
    existingClient.api_url
      ? "Server base URL (api_url)"
      : "Server base URL (api_url, e.g. https://tm.example.com)",
    String(existingClient.api_url ?? ""),
    normalizeClientApiUrl,
    { progress, label: "Server base URL (api_url)" },
  );

  // Same retry treatment for the api_key prompt: a paste mistake should not
  // kill the wizard. Validation lives in `validateCliApiKeyInput`.
  const apiKeyTrimmed = await promptValidatedWithDefault(
    "CLI API key (from the server: hirotaskmanager server api-key generate)",
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
    "Set this profile as the default for hirotm (no --profile needed)",
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
