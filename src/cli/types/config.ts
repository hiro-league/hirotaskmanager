import type { RuntimeConfigOverrides } from "../../shared/runtimeConfig";
import type { ServerStatus as SharedServerStatus } from "../../shared/serverStatus";

export type ConfigOverrides = RuntimeConfigOverrides;

/** Snapshot from `readServerStatus` / server lifecycle helpers. */
export type ServerStatus = SharedServerStatus;
