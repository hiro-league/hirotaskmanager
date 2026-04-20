import {
  getDefaultDataDir,
  getProfileConfigFilePath,
  getProfileRootDir,
  getServerPidFilePath,
  hasProfileConfigFile,
  readProfileConfig,
  resolveApiKey as resolveRuntimeApiKey,
  resolveApiUrl as resolveRuntimeApiUrl,
  resolveAuthDir as resolveRuntimeAuthDir,
  resolveBindAddress as resolveRuntimeBindAddress,
  resolveDefaultProfileName as resolveRuntimeDefaultProfileName,
  resolveOpenBrowser as resolveRuntimeOpenBrowser,
  resolvePort as resolveRuntimePort,
  resolveDataDir as resolveRuntimeDataDir,
  resolveProfileName,
  resolveProfileRole as resolveRuntimeProfileRole,
  resolveRequireCliApiKey as resolveRuntimeRequireCliApiKey,
  resolveRuntimeKind,
  setRuntimeConfigSelection,
  writeDefaultProfileName as writeRuntimeDefaultProfileName,
  writeProfileConfig,
  type RuntimeConfigFile,
  type RuntimeKind,
} from "../../../shared/runtimeConfig";

import type { ConfigOverrides } from "../../types/config";

export type { ConfigOverrides } from "../../types/config";
export type CliConfigFile = RuntimeConfigFile;

export function setRuntimeProfile(profile: string | undefined): void {
  setRuntimeConfigSelection({ profile });
}

export function setRuntimeKind(kind: RuntimeKind | undefined): void {
  setRuntimeConfigSelection({ kind });
}

export {
  getProfileConfigFilePath as getCliConfigFilePath,
  getProfileRootDir as getCliHomeDir,
  getServerPidFilePath,
  hasProfileConfigFile as hasCliConfigFile,
  readProfileConfig as readConfigFile,
  resolveProfileName,
  resolveRuntimeKind,
  writeProfileConfig as writeConfigFile,
};

export function getDefaultInstalledDataDir(
  overrides: ConfigOverrides = {},
): string {
  return getDefaultDataDir({ ...overrides, kind: "installed" });
}

export function resolvePort(overrides: ConfigOverrides = {}): number {
  return resolveRuntimePort(overrides);
}

export function resolveDataDir(overrides: ConfigOverrides = {}): string {
  return resolveRuntimeDataDir(overrides);
}

export function resolveAuthDir(overrides: ConfigOverrides = {}): string {
  return resolveRuntimeAuthDir(overrides);
}

export function resolveOpenBrowser(overrides: ConfigOverrides = {}): boolean {
  return resolveRuntimeOpenBrowser(overrides);
}

export function resolveApiKey(overrides: ConfigOverrides = {}): string | undefined {
  return resolveRuntimeApiKey(overrides);
}

export {
  resolveRuntimeApiUrl as resolveApiUrl,
  resolveRuntimeBindAddress as resolveBindAddress,
  resolveRuntimeDefaultProfileName as resolveDefaultProfileName,
  resolveRuntimeProfileRole as resolveProfileRole,
  resolveRuntimeRequireCliApiKey as resolveRequireCliApiKey,
  writeRuntimeDefaultProfileName as writeDefaultProfileName,
};
