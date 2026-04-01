import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ConfigOverrides {
  port?: number;
  dataDir?: string;
}

interface CliConfigFile {
  api_key?: string;
  data_dir?: string;
  port?: number;
}

export function resolveHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
}

export function getCliHomeDir(): string {
  return path.join(resolveHomeDir(), ".hirotm");
}

export function ensureCliHomeDir(): string {
  const cliHomeDir = getCliHomeDir();
  // Keep CLI-managed state outside the caller's cwd so global installs behave consistently.
  mkdirSync(cliHomeDir, { recursive: true });
  return cliHomeDir;
}

function getConfigFileCandidates(): string[] {
  const cliHomeDir = getCliHomeDir();
  return [path.join(cliHomeDir, "config.json"), path.join(cliHomeDir, "config")];
}

function readConfigFile(): CliConfigFile {
  for (const candidate of getConfigFileCandidates()) {
    if (!existsSync(candidate)) continue;

    try {
      const raw = readFileSync(candidate, "utf8").trim();
      if (!raw) return {};
      return JSON.parse(raw) as CliConfigFile;
    } catch {
      return {};
    }
  }

  return {};
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

export function resolvePort(overrides: ConfigOverrides = {}): number {
  const fileConfig = readConfigFile();
  return (
    normalizePort(overrides.port) ??
    normalizePort(process.env.PORT) ??
    normalizePort(fileConfig.port) ??
    3001
  );
}

export function resolveDataDir(overrides: ConfigOverrides = {}): string | undefined {
  const fileConfig = readConfigFile();

  if (overrides.dataDir?.trim()) return path.resolve(overrides.dataDir);
  if (process.env.DATA_DIR?.trim()) return path.resolve(process.env.DATA_DIR);
  if (fileConfig.data_dir?.trim()) return path.resolve(fileConfig.data_dir);

  return undefined;
}

export function resolveApiKey(): string | undefined {
  const fileConfig = readConfigFile();

  if (process.env.API_KEY?.trim()) return process.env.API_KEY;
  if (fileConfig.api_key?.trim()) return fileConfig.api_key;

  return undefined;
}
