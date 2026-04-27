import { describe, expect, test } from "bun:test";
import type { ConfigOverrides } from "../lib/core/config";
import { createTestCliRuntime } from "../lib/core/runtime";
import { createDefaultCliContext } from "./context";
import { handleServerStart, handleServerStatus, handleServerStop } from "./server";
import type { CliContext } from "./context";
import type { ServerStartMode } from "../ports/process";
import type { RunningServerStatus } from "../../shared/serverStatus";

function baseCtx(overrides: Partial<CliContext> = {}): CliContext {
  return {
    ...createDefaultCliContext(),
    resolvePort: (o?: ConfigOverrides) =>
      typeof o?.port === "number" ? o.port : 3020,
    resolveDataDir: () => "/tmp/data",
    resolveProfileName: () => "remote",
    resolveProfileRole: () => "client",
    resolveApiUrl: () => "https://tasks.example.com",
    getRuntime: () => createTestCliRuntime({ port: 3020 }),
    ...overrides,
  };
}

describe("handleServerStatus", () => {
  test("prints status from readServerStatus", async () => {
    const status = {
      pid: 42,
      port: 3020,
      running: true,
      runtime: "installed",
      source: "installed",
      url: "http://127.0.0.1:3020",
    } satisfies RunningServerStatus;
    let printed: unknown;
    const ctx = baseCtx({
      printJson: (d) => {
        printed = d;
      },
      readServerStatus: async () => status,
    });

    await handleServerStatus(ctx);

    expect(printed).toEqual({
      kind: "server_status",
      profile: "remote",
      role: "client",
      running: true,
      reachable: true,
      api_url: "https://tasks.example.com",
      server_pid: 42,
      server_port: 3020,
      server_runtime: "installed",
      server_source: "installed",
      server_reported_url: "http://127.0.0.1:3020",
    });
  });

  test("prints flat stopped status with profile context", async () => {
    let printed: unknown;
    const ctx = baseCtx({
      readServerStatus: async () => ({ running: false }),
      printJson: (d) => {
        printed = d;
      },
    });

    await handleServerStatus(ctx);

    expect(printed).toEqual({
      kind: "server_status",
      profile: "remote",
      role: "client",
      running: false,
      reachable: false,
      api_url: "https://tasks.example.com",
    });
  });
});

describe("handleServerStart / handleServerStop", () => {
  test("background start passes port and prints JSON status", async () => {
    let startArgs: ConfigOverrides | undefined;
    let startMode: ServerStartMode | undefined;
    const status = {
      pid: 99,
      port: 3040,
      running: true,
      runtime: "installed",
      source: "installed",
      url: "http://127.0.0.1:3040",
    } satisfies RunningServerStatus;
    let printed: unknown;
    const ctx = baseCtx({
      resolvePort: () => 3040,
      startServer: async (opts, mode) => {
        startArgs = opts;
        startMode = mode;
        return status;
      },
      printJson: (d) => {
        printed = d;
      },
    });

    await handleServerStart(ctx, { background: true });

    expect(startArgs).toEqual({
      port: 3040,
    } satisfies ConfigOverrides);
    expect(startMode).toBe("background");
    expect(printed).toEqual(status);
  });

  test("default start uses background mode", async () => {
    let startMode: ServerStartMode | undefined;
    let printed: unknown;
    const ctx = baseCtx({
      startServer: async (_opts, mode) => {
        startMode = mode;
        return {
          pid: 88,
          port: 3020,
          running: true,
          runtime: "installed",
          source: "installed",
          url: "http://127.0.0.1:3020",
        } satisfies RunningServerStatus;
      },
      printJson: (d) => {
        printed = d;
      },
    });

    await handleServerStart(ctx, {});

    expect(startMode).toBe("background");
    expect(printed).toBeTruthy();
  });

  test("foreground start awaits startServer with foreground mode", async () => {
    let startMode: ServerStartMode | undefined;
    const ctx = baseCtx({
      startServer: async (_opts, mode) => {
        startMode = mode;
        return { running: false as const };
      },
    });

    await handleServerStart(ctx, { foreground: true });

    expect(startMode).toBe("foreground");
  });

  test("stop prints status from stopServer", async () => {
    const status = { running: false as const };
    let printed: unknown;
    const ctx = baseCtx({
      stopServer: async () => status,
      printJson: (d) => {
        printed = d;
      },
    });

    await handleServerStop(ctx);

    expect(printed).toEqual(status);
  });
});
