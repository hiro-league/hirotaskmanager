import type { RunningServerStatus } from "../../shared/serverStatus";
import type { ConfigOverrides, ServerStatus } from "../types/config";

export type ServerReadyCallback = (
  status: RunningServerStatus,
) => void | Promise<void>;

export type ServerStartMode =
  | "foreground"
  | "background"
  | "background-attached";

/**
 * Local process lifecycle for `hirotm server` (spawn, pid file, health polling).
 * Implemented by `adapters/node-process.ts` (delegates to `lib/process.ts`).
 */
export type ProcessPort = {
  readServerStatus: (
    overrides?: ConfigOverrides,
  ) => Promise<ServerStatus>;
  startServer: (
    overrides?: ConfigOverrides,
    mode?: ServerStartMode,
    onReady?: ServerReadyCallback,
  ) => Promise<ServerStatus>;
  stopServer: (overrides?: ConfigOverrides) => Promise<ServerStatus>;
};
