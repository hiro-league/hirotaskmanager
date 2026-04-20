import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { CLI_ERR, CliError } from "../cli/types/errors";
import { DEV_DEFAULT_PORT, INSTALLED_DEFAULT_PORT } from "./ports";
import { buildLocalServerUrl } from "./serverStatus";

/**
 * Default `bind_address` when omitted (design §2.1). Used for validation and
 * `resolveBindAddress` — not for HTTP client base URLs (those use {@link buildLocalServerUrl}).
 */
export const DEFAULT_BIND_ADDRESS = "127.0.0.1";

export type RuntimeKind = "installed" | "dev";

export type ProfileRole = "server" | "client";

export interface RuntimeConfigFile {
  role: ProfileRole;

  // server-role fields (forbidden on client profiles)
  port?: number;
  data_dir?: string;
  open_browser?: boolean;
  bind_address?: string;
  require_cli_api_key?: boolean;
  /** Optional on server; required on client. */
  api_key?: string;

  // client-role fields (forbidden on server profiles)
  api_url?: string;
}

/**
 * Schema version for `~/.taskmanager/config.json`. Bump on breaking changes
 * to the top-level pointer file so older binaries refuse to read newer
 * formats instead of silently dropping fields.
 */
export const TOP_LEVEL_CONFIG_VERSION = 1 as const;

export interface TopLevelConfigFile {
  /** Required on disk; older versions are rejected. */
  version?: number;
  default_profile?: string;
}

export interface RuntimeConfigOverrides {
  kind?: RuntimeKind;
  profile?: string;
  /** Programmatic override only (e.g. tests); not exposed as a CLI flag. */
  port?: number;
}

let selectedRuntimeKind: RuntimeKind | undefined;
let selectedProfileName: string | undefined;

/** Clears argv-style profile selection; for tests that need a clean resolver state. */
export function resetRuntimeConfigSelectionForTests(): void {
  selectedRuntimeKind = undefined;
  selectedProfileName = undefined;
}

function normalizeProfileName(profile: string | undefined): string | undefined {
  const trimmed = profile?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
}

function normalizePort(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return undefined;
}

function invalidConfigError(
  configPath: string,
  fields: string[],
  message: string,
): CliError {
  return new CliError(message, 2, {
    code: CLI_ERR.invalidConfig,
    configPath,
    fields,
  });
}

// Dedupes validation warnings that would otherwise fire on every config read
// (each resolver calls readProfileConfig → validateRuntimeConfigFile). Keyed
// per (configPath + message) so distinct profiles still surface their own
// warnings, but not once per CLI tool call.
const warnedConfigMessages = new Set<string>();
function warnOnce(configPath: string, message: string): void {
  const key = `${configPath}\0${message}`;
  if (warnedConfigMessages.has(key)) return;
  warnedConfigMessages.add(key);
  console.warn(message);
}

/** Resets the warn-once cache; for tests that read the same config repeatedly. */
export function resetRuntimeConfigWarningsForTests(): void {
  warnedConfigMessages.clear();
}

export function isLoopbackBindAddress(addr: string): boolean {
  const t = addr.trim().toLowerCase();
  return (
    t === DEFAULT_BIND_ADDRESS || t === "localhost" || t === "::1"
  );
}

// Hostname per RFC 1123 (LDH labels, no leading/trailing hyphen, max 253 chars).
// Conservative on purpose: bind_address is operator-edited and we'd rather
// reject something unusual at write time than discover it as a Bun.serve
// runtime error after `hirotaskmanager server start`.
const HOSTNAME_LABEL = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
function isValidHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;
  return value.split(".").every((label) => HOSTNAME_LABEL.test(label));
}

function isValidIPv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

// IPv6 lives behind URL parsing because writing a full IPv6 grammar by hand is
// error-prone; URL accepts bracketed IPv6 hostnames after we wrap them.
function isValidIPv6(value: string): boolean {
  try {
    const u = new URL(`http://[${value}]/`);
    return u.hostname === `[${value.toLowerCase()}]` || u.hostname.startsWith("[");
  } catch {
    return false;
  }
}

/**
 * Accept loopback aliases, IPv4, IPv6 (without brackets), or hostnames per RFC 1123.
 * Rejects empty strings and obvious typos at config-load time so operators see a
 * clear `CLI_ERR.invalidConfig` instead of a generic `Bun.serve` listen error.
 */
export function isValidBindAddress(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (isLoopbackBindAddress(t)) return true;
  if (t === "0.0.0.0" || t === "::") return true;
  if (isValidIPv4(t)) return true;
  if (isValidIPv6(t)) return true;
  return isValidHostname(t);
}

/**
 * CLI API key shape: `tmk-` prefix + 64 hex chars (32 bytes from randomBytes,
 * see {@link generateCliApiKey} in `src/server/cliApiKeys.ts`). Catch typos
 * and truncated pastes at config write time instead of letting them surface as
 * `auth_invalid_cli_key` later from the server.
 */
const CLI_API_KEY_PATTERN = /^tmk-[a-f0-9]{64}$/;
export function isWellFormedCliApiKey(value: string): boolean {
  return CLI_API_KEY_PATTERN.test(value);
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates profile `config.json` shape per remote-cli-access design §2.1.
 * Throws CliError(invalidConfig) on failure.
 */
export function validateRuntimeConfigFile(
  raw: Record<string, unknown>,
  configPath: string,
): RuntimeConfigFile {
  const fields: string[] = [];
  const roleRaw = raw.role;
  if (roleRaw !== "server" && roleRaw !== "client") {
    fields.push("role");
  }
  const role = roleRaw as ProfileRole | undefined;
  if (!role) {
    throw invalidConfigError(
      configPath,
      fields,
      `Invalid profile config at ${configPath}: ${fields.join(", ")}`,
    );
  }

  const serverOnly = [
    "port",
    "data_dir",
    "open_browser",
    "bind_address",
    "require_cli_api_key",
  ] as const;
  const clientOnly = ["api_url"] as const;

  if (role === "server") {
    for (const k of clientOnly) {
      if (raw[k] !== undefined) fields.push(k);
    }
    if (normalizePort(raw.port) === undefined) fields.push("port");
    if (typeof raw.data_dir !== "string" || !raw.data_dir.trim()) {
      fields.push("data_dir");
    }
    if (typeof raw.bind_address === "string" && !raw.bind_address.trim()) {
      fields.push("bind_address");
    }
    // Catch typos like "127.0.0..1" or "local host" at write time; otherwise
    // they only surface as a confusing `Bun.serve` listen failure inside the
    // spawned server child process, far from the offending config file.
    if (
      typeof raw.bind_address === "string" &&
      raw.bind_address.trim() &&
      !isValidBindAddress(raw.bind_address)
    ) {
      fields.push("bind_address");
    }
    if (fields.length) {
      throw invalidConfigError(
        configPath,
        fields,
        `Invalid server profile config at ${configPath}: missing or forbidden fields: ${fields.join(", ")}`,
      );
    }

    const bind =
      typeof raw.bind_address === "string" && raw.bind_address.trim()
        ? raw.bind_address.trim()
        : DEFAULT_BIND_ADDRESS;
    const requireExplicit = normalizeBoolean(raw.require_cli_api_key);
    if (!isLoopbackBindAddress(bind)) {
      if (requireExplicit === false) {
        throw invalidConfigError(
          configPath,
          ["require_cli_api_key", "bind_address"],
          `Invalid server profile config at ${configPath}: non-loopback bind_address requires require_cli_api_key (cannot be false).`,
        );
      }
      // Closes the foot-gun where an operator hand-edits bind_address to a
      // public interface but forgets to set require_cli_api_key explicitly.
      // The runtime resolver derives `true` from the bind address anyway, but
      // forcing the field to be present makes the choice auditable in the
      // config file itself instead of an implicit default.
      if (requireExplicit === undefined) {
        throw invalidConfigError(
          configPath,
          ["require_cli_api_key"],
          `Invalid server profile config at ${configPath}: non-loopback bind_address (${bind}) requires require_cli_api_key to be set explicitly to true.`,
        );
      }
    }

    // api_key on a server profile is optional, but if present it must look
    // like a real CLI API key. Catches accidental garbage in the local-CLI
    // copy of the key (design §2.6 — the field stores the SAME value the
    // client profile would store, so the same shape applies).
    if (raw.api_key !== undefined) {
      if (typeof raw.api_key !== "string") {
        fields.push("api_key");
      } else if (!raw.api_key.trim()) {
        fields.push("api_key");
      } else if (!isWellFormedCliApiKey(raw.api_key.trim())) {
        fields.push("api_key");
      }
      if (fields.includes("api_key")) {
        throw invalidConfigError(
          configPath,
          ["api_key"],
          `Invalid server profile config at ${configPath}: api_key must match tmk-<64 hex chars>.`,
        );
      }
    }

    if (requireExplicit === true) {
      const key =
        typeof raw.api_key === "string" && raw.api_key.trim()
          ? raw.api_key.trim()
          : undefined;
      if (!key) {
        // Design §2.1 rule 5: warn only; local CLI may still use cli-api-keys.json later.
        warnOnce(
          configPath,
          `[taskmanager] Profile ${configPath}: require_cli_api_key is true but api_key is not set. ` +
            `The local CLI on this machine may fail until you set api_key or use cli-api-keys file.`,
        );
      }
    }
  } else {
    // client
    for (const k of serverOnly) {
      if (raw[k] !== undefined) fields.push(k);
    }
    if (raw.api_key !== undefined && typeof raw.api_key !== "string") {
      fields.push("api_key");
    }
    const apiKey =
      typeof raw.api_key === "string" && raw.api_key.trim()
        ? raw.api_key.trim()
        : undefined;
    if (!apiKey) {
      fields.push("api_key");
    } else if (!isWellFormedCliApiKey(apiKey)) {
      // Catches typo'd or truncated pastes at write time so the operator gets
      // a clear schema error instead of a confusing `auth_invalid_cli_key`
      // from the server later.
      fields.push("api_key");
    }

    const url =
      typeof raw.api_url === "string" && raw.api_url.trim()
        ? raw.api_url.trim()
        : undefined;
    if (!url || !isAbsoluteHttpUrl(url)) {
      fields.push("api_url");
    }

    if (fields.length) {
      throw invalidConfigError(
        configPath,
        fields,
        `Invalid client profile config at ${configPath}: missing or forbidden fields: ${fields.join(", ")}`,
      );
    }
  }

  return raw as unknown as RuntimeConfigFile;
}

export function setRuntimeConfigSelection(selection: {
  kind?: RuntimeKind;
  profile?: string;
}): void {
  if (selection.kind) selectedRuntimeKind = selection.kind;
  if (selection.profile !== undefined) {
    selectedProfileName = normalizeProfileName(selection.profile);
  }
}

// Runtime kind is set explicitly via --dev flag or setRuntimeConfigSelection.
export function resolveRuntimeKind(overrides: RuntimeConfigOverrides = {}): RuntimeKind {
  return (
    overrides.kind ??
    selectedRuntimeKind ??
    "installed"
  );
}

function getTopLevelConfigPath(): string {
  return path.join(getTaskManagerHomeDir(), "config.json");
}

function readTopLevelConfigFile(): TopLevelConfigFile {
  const p = getTopLevelConfigPath();
  if (!existsSync(p)) return {};
  try {
    const raw = readFileSync(p, "utf8").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw invalidConfigError(
        p,
        ["(top-level config)"],
        `Invalid top-level config at ${p}: expected a JSON object`,
      );
    }
    const obj = parsed as Record<string, unknown>;
    // Reject unknown versions early so a downgraded binary refuses to silently
    // drop fields written by a newer one (initial-development rule: no implicit
    // backward compat). A missing `version` is still tolerated for first-run
    // pointers written before this field existed; writeDefaultProfileName always
    // adds it on the next write.
    if (obj.version !== undefined) {
      if (obj.version !== TOP_LEVEL_CONFIG_VERSION) {
        throw invalidConfigError(
          p,
          ["version"],
          `Unsupported top-level config version at ${p}: got ${String(obj.version)}, expected ${TOP_LEVEL_CONFIG_VERSION}.`,
        );
      }
    }
    return obj as TopLevelConfigFile;
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw invalidConfigError(
      p,
      ["(top-level config)"],
      `Failed to read top-level config at ${p}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export function resolveDefaultProfileName(): string | undefined {
  const raw = readTopLevelConfigFile().default_profile;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return raw.trim();
}

export function writeDefaultProfileName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) {
    throw invalidConfigError(
      getTopLevelConfigPath(),
      ["default_profile"],
      "default_profile name cannot be empty",
    );
  }
  const home = getTaskManagerHomeDir();
  mkdirSync(home, { recursive: true });
  const p = getTopLevelConfigPath();
  // Only persist known fields so a future-downgraded binary cannot carry
  // forward unknown keys it does not understand (avoid garbage propagation
  // across versions). Always stamp the current schema version.
  const next: TopLevelConfigFile = {
    version: TOP_LEVEL_CONFIG_VERSION,
    default_profile: trimmed,
  };
  writeFileSync(p, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

/** Profile directory names under `profiles/` that have a `config.json`. */
export function listProfileNamesWithConfig(): string[] {
  const profilesRoot = path.join(getTaskManagerHomeDir(), "profiles");
  if (!existsSync(profilesRoot)) return [];
  const names: string[] = [];
  try {
    for (const ent of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (existsSync(path.join(profilesRoot, ent.name, "config.json"))) {
        names.push(ent.name);
      }
    }
  } catch {
    return [];
  }
  return names.sort();
}

export function resolveProfileName(
  overrides: RuntimeConfigOverrides = {},
): string {
  const fromOverride = normalizeProfileName(overrides.profile);
  if (fromOverride) return fromOverride;

  if (selectedProfileName) return selectedProfileName;

  const fromPointer = resolveDefaultProfileName();
  if (fromPointer) return fromPointer;

  const withConfig = listProfileNamesWithConfig();
  if (withConfig.length === 1) {
    return withConfig[0]!;
  }
  if (withConfig.length > 1) {
    throw new CliError(
      `Multiple TaskManager profiles exist (${withConfig.join(", ")}) but no default is set. ` +
        `Run \`hirotaskmanager profile use <name>\` or pass --profile.`,
      2,
      {
        code: CLI_ERR.invalidConfig,
        profiles: withConfig,
        hint: "Set default_profile in ~/.taskmanager/config.json or use --profile.",
      },
    );
  }

  return "default";
}

export function getTaskManagerHomeDir(): string {
  return path.join(resolveHomeDir(), ".taskmanager");
}

/** True if any `~/.taskmanager/profiles/<name>/config.json` exists (any named profile). */
export function hasAnyProfileConfigOnDisk(): boolean {
  return listProfileNamesWithConfig().length > 0;
}

export function getProfileRootDir(overrides: RuntimeConfigOverrides = {}): string {
  return path.join(getTaskManagerHomeDir(), "profiles", resolveProfileName(overrides));
}

export function ensureProfileRootDir(overrides: RuntimeConfigOverrides = {}): string {
  const profileRootDir = getProfileRootDir(overrides);
  mkdirSync(profileRootDir, { recursive: true });
  return profileRootDir;
}

export function ensureRuntimeDirectories(
  overrides: RuntimeConfigOverrides = {},
): {
  profileRootDir: string;
  dataDir: string;
  authDir: string;
} {
  const profileRootDir = ensureProfileRootDir(overrides);
  const dataDir = resolveDataDir(overrides);
  const authDir = resolveAuthDir(overrides);

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(authDir, { recursive: true });

  return {
    profileRootDir,
    dataDir,
    authDir,
  };
}

export function getProfileConfigFilePath(overrides: RuntimeConfigOverrides = {}): string {
  return path.join(getProfileRootDir(overrides), "config.json");
}

export function hasProfileConfigFile(overrides: RuntimeConfigOverrides = {}): boolean {
  return existsSync(getProfileConfigFilePath(overrides));
}

function parseProfileConfigJson(
  raw: string,
  configPath: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw invalidConfigError(
      configPath,
      ["(invalid JSON)"],
      `Invalid JSON in profile config at ${configPath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw invalidConfigError(
      configPath,
      ["(invalid shape)"],
      `Profile config at ${configPath} must be a JSON object`,
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * Reads and validates the active profile's `config.json`.
 * Returns `undefined` when the file is missing (caller may treat as bootstrap / no profile yet).
 * Throws {@link CliError} with `CLI_ERR.invalidConfig` when the file exists but is invalid.
 */
export function readProfileConfig(
  overrides: RuntimeConfigOverrides = {},
): RuntimeConfigFile | undefined {
  const configFilePath = getProfileConfigFilePath(overrides);
  if (!existsSync(configFilePath)) return undefined;

  let raw: string;
  try {
    raw = readFileSync(configFilePath, "utf8").trim();
  } catch (e) {
    throw invalidConfigError(
      configFilePath,
      ["(read error)"],
      `Failed to read profile config at ${configFilePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!raw) {
    throw invalidConfigError(
      configFilePath,
      ["(empty file)"],
      `Profile config at ${configFilePath} is empty`,
    );
  }
  const obj = parseProfileConfigJson(raw, configFilePath);
  return validateRuntimeConfigFile(obj, configFilePath);
}

function requireReadProfileConfig(
  overrides: RuntimeConfigOverrides,
): RuntimeConfigFile {
  const c = readProfileConfig(overrides);
  if (!c) {
    const p = getProfileConfigFilePath(overrides);
    throw invalidConfigError(
      p,
      ["(missing file)"],
      `Profile config is missing at ${p}. Create it with hirotaskmanager setup or add role and required fields.`,
    );
  }
  return c;
}

function assertRoleServer(
  config: RuntimeConfigFile,
  configPath: string,
): void {
  if (config.role !== "server") {
    throw invalidConfigError(
      configPath,
      ["role"],
      `Expected server profile at ${configPath}; use a server profile for this operation.`,
    );
  }
}

export function resolveProfileRole(
  overrides: RuntimeConfigOverrides = {},
): ProfileRole {
  return requireReadProfileConfig(overrides).role;
}

export function resolveBindAddress(
  overrides: RuntimeConfigOverrides = {},
): string {
  const config = requireReadProfileConfig(overrides);
  const configPath = getProfileConfigFilePath(overrides);
  assertRoleServer(config, configPath);
  const raw = config.bind_address?.trim();
  return raw || DEFAULT_BIND_ADDRESS;
}

export function resolveRequireCliApiKey(
  overrides: RuntimeConfigOverrides = {},
): boolean {
  const config = requireReadProfileConfig(overrides);
  const configPath = getProfileConfigFilePath(overrides);
  assertRoleServer(config, configPath);
  if (config.require_cli_api_key !== undefined) {
    return config.require_cli_api_key;
  }
  // Inline bind default so we do not recurse through resolveBindAddress + requireReadProfileConfig again.
  const bind = config.bind_address?.trim() || DEFAULT_BIND_ADDRESS;
  return !isLoopbackBindAddress(bind);
}

/**
 * API base URL for the active profile: loopback + port for server profiles; `api_url` for clients.
 */
export function resolveApiUrl(overrides: RuntimeConfigOverrides = {}): string {
  const config = readProfileConfig(overrides);
  if (!config) {
    const port =
      normalizePort(overrides.port) ?? getDefaultPort(overrides);
    return buildLocalServerUrl(port);
  }
  if (config.role === "client") {
    return config.api_url!.replace(/\/+$/, "");
  }
  const port = resolvePort(overrides);
  return buildLocalServerUrl(port);
}

export function writeProfileConfig(
  config: RuntimeConfigFile,
  overrides: RuntimeConfigOverrides = {},
): string {
  const configFilePath = path.join(ensureProfileRootDir(overrides), "config.json");
  validateRuntimeConfigFile(
    { ...(config as unknown as Record<string, unknown>) },
    configFilePath,
  );
  writeFileSync(configFilePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configFilePath;
}

export function getDefaultPort(overrides: RuntimeConfigOverrides = {}): number {
  return resolveRuntimeKind(overrides) === "dev"
    ? DEV_DEFAULT_PORT
    : INSTALLED_DEFAULT_PORT;
}

// All profiles (including dev) use the profile-based data dir under
// ~/.taskmanager/profiles/<name>/data unless `data_dir` in config.json overrides.
export function getDefaultDataDir(overrides: RuntimeConfigOverrides = {}): string {
  return path.join(getProfileRootDir(overrides), "data");
}

export function getDefaultAuthDir(overrides: RuntimeConfigOverrides = {}): string {
  return path.join(getProfileRootDir(overrides), "auth");
}

export function getServerPidFilePath(overrides: RuntimeConfigOverrides = {}): string {
  return path.join(getProfileRootDir(overrides), "server.pid.json");
}

export function resolvePort(overrides: RuntimeConfigOverrides = {}): number {
  const config = readProfileConfig(overrides);
  if (!config) {
    return (
      normalizePort(overrides.port) ?? getDefaultPort(overrides)
    );
  }
  // Client profiles target a remote API over `api_url` (resolved by
  // `resolveApiUrl`), so `port` is not meaningful for them. Returning the
  // override or default keeps callers (CLI runtime snapshot, handler
  // plumbing) working without forcing a server-only assertion that broke
  // every read/mutate command on a client profile.
  if (config.role !== "server") {
    return normalizePort(overrides.port) ?? getDefaultPort(overrides);
  }
  return (
    normalizePort(overrides.port) ??
    normalizePort(config.port) ??
    getDefaultPort(overrides)
  );
}

export function resolveDataDir(overrides: RuntimeConfigOverrides = {}): string {
  const config = readProfileConfig(overrides);
  if (!config) {
    return path.resolve(getDefaultDataDir(overrides));
  }
  const configPath = getProfileConfigFilePath(overrides);
  assertRoleServer(config, configPath);
  return path.resolve(
    config.data_dir ?? getDefaultDataDir(overrides),
  );
}

// Auth always lives at <profileRoot>/auth — the prompt/override was removed
// because (a) the dir only stores the web passphrase hash + CLI API key
// hashes, neither of which benefits from being on a separate volume, and
// (b) two profiles pointed at the same auth dir would silently share keys.
// Server role is still asserted (when a config exists) so non-server profiles
// fail loudly instead of silently writing keys into the wrong place.
export function resolveAuthDir(overrides: RuntimeConfigOverrides = {}): string {
  const config = readProfileConfig(overrides);
  if (config) {
    const configPath = getProfileConfigFilePath(overrides);
    assertRoleServer(config, configPath);
  }
  return path.resolve(getDefaultAuthDir(overrides));
}

export function resolveOpenBrowser(overrides: RuntimeConfigOverrides = {}): boolean {
  const config = readProfileConfig(overrides);
  if (!config) {
    return true;
  }
  const configPath = getProfileConfigFilePath(overrides);
  assertRoleServer(config, configPath);
  return (
    normalizeBoolean(config.open_browser) ??
    true
  );
}

export function resolveApiKey(overrides: RuntimeConfigOverrides = {}): string | undefined {
  const config = readProfileConfig(overrides);
  if (!config) return undefined;
  if (config.api_key?.trim()) return config.api_key.trim();
  return undefined;
}
