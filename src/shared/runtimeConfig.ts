import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type RuntimeKind = "installed" | "dev";

export interface RuntimeConfigFile {
  api_key?: string;
  port?: number;
  data_dir?: string;
  auth_dir?: string;
  open_browser?: boolean;
}

export interface RuntimeConfigOverrides {
  kind?: RuntimeKind;
  profile?: string;
  port?: number;
  dataDir?: string;
  authDir?: string;
  openBrowser?: boolean;
}

let selectedRuntimeKind: RuntimeKind | undefined;
let selectedProfileName: string | undefined;
/** Set from global `hirotm --port` (parsed before Commander); not read from any env var. */
let selectedCliPort: number | undefined;

function normalizeProfileName(profile: string | undefined): string | undefined {
  const trimmed = profile?.trim();
  return trimmed ? trimmed : undefined;
}

function readRuntimeKindFromEnv(): RuntimeKind | undefined {
  const value = process.env.TASKMANAGER_RUNTIME?.trim().toLowerCase();
  if (value === "installed" || value === "dev") return value;
  return undefined;
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

export function setRuntimeConfigSelection(selection: {
  kind?: RuntimeKind;
  profile?: string;
  port?: number;
}): void {
  if (selection.kind) selectedRuntimeKind = selection.kind;
  if (selection.profile !== undefined) {
    selectedProfileName = normalizeProfileName(selection.profile);
  }
  if (selection.port !== undefined) {
    const p = normalizePort(selection.port);
    selectedCliPort = p;
  }
}

// Runtime kind is set explicitly via --dev flag, setRuntimeConfigSelection, or
// TASKMANAGER_RUNTIME env. Profile name no longer implies runtime kind.
export function resolveRuntimeKind(overrides: RuntimeConfigOverrides = {}): RuntimeKind {
  return (
    overrides.kind ??
    selectedRuntimeKind ??
    readRuntimeKindFromEnv() ??
    "installed"
  );
}

export function resolveProfileName(overrides: RuntimeConfigOverrides = {}): string {
  return (
    normalizeProfileName(overrides.profile) ??
    selectedProfileName ??
    "default"
  );
}

export function getTaskManagerHomeDir(): string {
  return path.join(resolveHomeDir(), ".taskmanager");
}

/** True if any `~/.taskmanager/profiles/<name>/config.json` exists (any named profile). */
export function hasAnyProfileConfigOnDisk(): boolean {
  const profilesRoot = path.join(getTaskManagerHomeDir(), "profiles");
  if (!existsSync(profilesRoot)) return false;
  try {
    for (const ent of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (existsSync(path.join(profilesRoot, ent.name, "config.json"))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
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

export function readProfileConfig(
  overrides: RuntimeConfigOverrides = {},
): RuntimeConfigFile {
  const configFilePath = getProfileConfigFilePath(overrides);
  if (!existsSync(configFilePath)) return {};

  try {
    const raw = readFileSync(configFilePath, "utf8").trim();
    if (!raw) return {};
    return JSON.parse(raw) as RuntimeConfigFile;
  } catch {
    return {};
  }
}

export function writeProfileConfig(
  config: RuntimeConfigFile,
  overrides: RuntimeConfigOverrides = {},
): string {
  const configFilePath = path.join(ensureProfileRootDir(overrides), "config.json");
  writeFileSync(configFilePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configFilePath;
}

export function getDefaultPort(overrides: RuntimeConfigOverrides = {}): number {
  return resolveRuntimeKind(overrides) === "dev" ? 3002 : 3001;
}

// All profiles (including dev) use the profile-based data dir under
// ~/.taskmanager/profiles/<name>/data. Use --data-dir or config.json
// data_dir to override.
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
  return (
    normalizePort(overrides.port) ??
    normalizePort(selectedCliPort) ??
    normalizePort(config.port) ??
    getDefaultPort(overrides)
  );
}

export function resolveDataDir(overrides: RuntimeConfigOverrides = {}): string {
  const config = readProfileConfig(overrides);
  return path.resolve(
    overrides.dataDir ??
      process.env.TASKMANAGER_DATA_DIR ??
      config.data_dir ??
      getDefaultDataDir(overrides),
  );
}

export function resolveAuthDir(overrides: RuntimeConfigOverrides = {}): string {
  const config = readProfileConfig(overrides);
  return path.resolve(
    overrides.authDir ??
      process.env.TASKMANAGER_AUTH_DIR ??
      config.auth_dir ??
      getDefaultAuthDir(overrides),
  );
}

export function resolveOpenBrowser(overrides: RuntimeConfigOverrides = {}): boolean {
  const config = readProfileConfig(overrides);
  return (
    normalizeBoolean(overrides.openBrowser) ??
    normalizeBoolean(process.env.TASKMANAGER_OPEN_BROWSER) ??
    normalizeBoolean(config.open_browser) ??
    true
  );
}

export function resolveApiKey(overrides: RuntimeConfigOverrides = {}): string | undefined {
  const config = readProfileConfig(overrides);

  if (process.env.API_KEY?.trim()) return process.env.API_KEY;
  if (config.api_key?.trim()) return config.api_key;

  return undefined;
}
