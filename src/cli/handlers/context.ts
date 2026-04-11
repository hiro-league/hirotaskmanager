import { fetchApi } from "../lib/api-client";
import type { ConfigOverrides } from "../lib/config";
import { resolveDataDir, resolvePort } from "../lib/config";
import { printJson } from "../lib/output";
import { readServerStatus, startServer, stopServer } from "../lib/process";

/**
 * Injected dependencies for CLI handlers (Phase 2) so use-cases stay testable
 * without Commander and can swap fetch/output in tests later.
 */
export type CliContext = {
  resolvePort: (overrides?: ConfigOverrides) => number;
  resolveDataDir: (overrides?: ConfigOverrides) => string;
  fetchApi: typeof fetchApi;
  printJson: typeof printJson;
  startServer: typeof startServer;
  stopServer: typeof stopServer;
  readServerStatus: typeof readServerStatus;
};

export function createDefaultCliContext(): CliContext {
  return {
    resolvePort,
    resolveDataDir,
    fetchApi,
    printJson,
    startServer,
    stopServer,
    readServerStatus,
  };
}
