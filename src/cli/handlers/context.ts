import { fetchApi } from "../lib/api-client";
import type { ConfigOverrides } from "../lib/config";
import { resolveDataDir, resolvePort } from "../lib/config";
import { printJson, printSearchTable } from "../lib/output";
import { readServerStatus, startServer } from "../lib/process";

/**
 * Injected dependencies for CLI handlers (Phase 2) so use-cases stay testable
 * without Commander and can swap fetch/output in tests later.
 */
export type CliContext = {
  resolvePort: (overrides?: ConfigOverrides) => number;
  resolveDataDir: (overrides?: ConfigOverrides) => string;
  fetchApi: typeof fetchApi;
  printJson: typeof printJson;
  printSearchTable: typeof printSearchTable;
  startServer: typeof startServer;
  readServerStatus: typeof readServerStatus;
};

export function createDefaultCliContext(): CliContext {
  return {
    resolvePort,
    resolveDataDir,
    fetchApi,
    printJson,
    printSearchTable,
    startServer,
    readServerStatus,
  };
}
