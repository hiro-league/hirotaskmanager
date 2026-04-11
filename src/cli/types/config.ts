import type { RuntimeConfigOverrides } from "../../shared/runtimeConfig";

export type ConfigOverrides = RuntimeConfigOverrides;

/** Snapshot from `readServerStatus` / server lifecycle helpers. */
export interface ServerStatus {
  pid?: number;
  port?: number;
  running: boolean;
  url?: string;
}
