import type { RuntimeKind } from "../../shared/runtimeConfig";
import type { ConfigOverrides } from "./config";
import type { CliOutputFormat } from "./output";
import type { ApiPort } from "../ports/api";
import type { OutputPort } from "../ports/output";
import type { ProcessPort } from "../ports/process";

/**
 * Snapshot of format, client identity, profile/kind, default port (see `lib/runtime.ts`).
 * Module-level getters in `cliFormat`, `clientIdentity`, and `shared/runtimeConfig` remain
 * the live source; `captureCliRuntime` reads them for context and tests.
 */
export type CliRuntime = {
  readonly outputFormat: CliOutputFormat;
  readonly quiet: boolean;
  readonly clientName: string;
  readonly clientInstanceId: string;
  readonly profile: string;
  readonly runtimeKind: RuntimeKind;
  /** Resolved default API port (`resolvePort` with the same overrides). */
  readonly port: number;
};

type CliConfigPort = {
  resolvePort: (overrides?: ConfigOverrides) => number;
  resolveDataDir: (overrides?: ConfigOverrides) => string;
};

/**
 * Injected dependencies for CLI handlers so use-cases stay testable
 * without Commander and can swap fetch/output in tests.
 * Composes `ApiPort`, `OutputPort`, and `ProcessPort` (see `docs/cli-rearchitecture.md`).
 */
export type CliContext = CliConfigPort &
  ApiPort &
  OutputPort &
  ProcessPort & {
    getRuntime: () => CliRuntime;
  };
