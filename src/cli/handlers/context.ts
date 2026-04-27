import { createHttpApiAdapter } from "../adapters/http-api";
import { createNodeOutputAdapter } from "../adapters/node-output";
import { createNodeProcessAdapter } from "../adapters/node-process";
import {
  resolveApiUrl,
  resolveDataDir,
  resolvePort,
  resolveProfileName,
  resolveProfileRole,
} from "../lib/core/config";
import { captureCliRuntime } from "../lib/core/runtime";
import type { CliContext, CliRuntime } from "../types/context";

export type { CliContext, CliRuntime };

/** Composition root: default Bun/HTTP adapters wired to `CliContext`. */
export function createDefaultCliContext(): CliContext {
  return {
    resolvePort,
    resolveDataDir,
    resolveProfileName,
    resolveProfileRole,
    resolveApiUrl,
    ...createHttpApiAdapter(),
    ...createNodeOutputAdapter(),
    ...createNodeProcessAdapter(),
    getRuntime: () => captureCliRuntime(),
  };
}
