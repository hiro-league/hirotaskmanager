/**
 * Single aggregate for CLI-facing runtime state (see docs/cli-architecture-review.md §6).
 * Module-level getters in `cliFormat`, `clientIdentity`, and `shared/runtimeConfig` remain
 * the live source; `captureCliRuntime` snapshots them for context and tests.
 */
import type { CliRuntime } from "../../types/context";
import {
  getRuntimeCliClientInstanceId,
  getRuntimeCliClientName,
} from "../client/clientIdentity";
import type { ConfigOverrides } from "./config";
import {
  resolvePort,
  resolveProfileName,
  resolveRuntimeKind,
} from "./config";
import { getCliOutputFormat, getCliQuiet } from "../output/cliFormat";
import { INSTALLED_DEFAULT_PORT } from "../../../shared/ports";
import { TASK_MANAGER_CLIENT_HIROTM } from "../../../shared/boardCliAccess";

export type { CliRuntime } from "../../types/context";

/** Snapshot current process globals and resolved config (call after `applyCliRuntimeFromArgv` + format sync). */
export function captureCliRuntime(
  overrides: ConfigOverrides = {},
): CliRuntime {
  return {
    outputFormat: getCliOutputFormat(),
    quiet: getCliQuiet(),
    clientName: getRuntimeCliClientName(),
    clientInstanceId: getRuntimeCliClientInstanceId(),
    profile: resolveProfileName(overrides),
    runtimeKind: resolveRuntimeKind(overrides),
    port: resolvePort(overrides),
  };
}

/** Deterministic defaults for unit tests (no reliance on module globals). */
export function createTestCliRuntime(
  overrides: Partial<CliRuntime> = {},
): CliRuntime {
  return {
    outputFormat: "ndjson",
    quiet: false,
    clientName: TASK_MANAGER_CLIENT_HIROTM,
    clientInstanceId: "00000000-0000-0000-0000-000000000001",
    profile: "default",
    runtimeKind: "installed",
    port: INSTALLED_DEFAULT_PORT,
    ...overrides,
  };
}
