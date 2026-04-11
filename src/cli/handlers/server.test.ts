import { describe, expect, test } from "bun:test";
import type { ConfigOverrides } from "../lib/config";
import { handleServerStart, handleServerStatus, handleServerStop } from "./server";
import type { CliContext } from "./context";

function baseCtx(overrides: Partial<CliContext> = {}): CliContext {
  return {
    resolvePort: (o?: ConfigOverrides) =>
      typeof o?.port === "number" ? o.port : 3020,
    resolveDataDir: (o?: ConfigOverrides) =>
      (o?.dataDir as string | undefined) ?? "/tmp/data",
    fetchApi: async () => {
      throw new Error("unused");
    },
    printJson: () => {},
    startServer: async () => {
      throw new Error("unused");
    },
    stopServer: async () => {
      throw new Error("unused");
    },
    readServerStatus: async () => ({ running: false }),
    ...overrides,
  };
}

describe("handleServerStatus", () => {
  test("prints status from readServerStatus", async () => {
    const status = { running: true, pid: 42 };
    let printed: unknown;
    const ctx = baseCtx({
      printJson: (d) => {
        printed = d;
      },
      readServerStatus: async () => status,
    });

    await handleServerStatus(ctx, {});

    expect(printed).toEqual(status);
  });
});

describe("handleServerStart / handleServerStop", () => {
  test("background start passes dataDir + port and prints JSON status", async () => {
    let startArgs: ConfigOverrides | undefined;
    let backgroundFlag: boolean | undefined;
    const status = { running: true, pid: 99, port: 3040 };
    let printed: unknown;
    const ctx = baseCtx({
      resolveDataDir: () => "/custom/data",
      resolvePort: () => 3040,
      startServer: async (opts, bg) => {
        startArgs = opts;
        backgroundFlag = bg;
        return status;
      },
      printJson: (d) => {
        printed = d;
      },
    });

    await handleServerStart(ctx, { background: true });

    expect(startArgs).toEqual({
      dataDir: "/custom/data",
      port: 3040,
    } satisfies ConfigOverrides);
    expect(backgroundFlag).toBe(true);
    expect(printed).toEqual(status);
  });

  test("foreground start awaits startServer with background false", async () => {
    let backgroundFlag: boolean | undefined;
    const ctx = baseCtx({
      startServer: async (_opts, bg) => {
        backgroundFlag = bg;
        return { running: false };
      },
    });

    await handleServerStart(ctx, {});

    expect(backgroundFlag).toBe(false);
  });

  test("stop prints status from stopServer", async () => {
    const status = { running: false };
    let printed: unknown;
    const ctx = baseCtx({
      stopServer: async () => status,
      printJson: (d) => {
        printed = d;
      },
    });

    await handleServerStop(ctx, {});

    expect(printed).toEqual(status);
  });
});
