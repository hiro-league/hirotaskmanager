/**
 * Unit tests for `process.ts` server status and pid-file behavior (mock `fetch` for health checks).
 * Bun.spawn lifecycle is covered by real-stack tests.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getServerPidFilePath } from "./config";
import { readServerStatus, startServer, stopServer } from "./process";
import { CLI_ERR } from "../../types/errors";
import { CliError } from "../output/output";

describe("process.ts server lifecycle (mock fetch)", () => {
  const origFetch = globalThis.fetch;
  const origHome = process.env.HOME;
  let testHome: string;

  beforeEach(() => {
    testHome = mkdtempSync(path.join(tmpdir(), "hirotm-process-test-"));
    process.env.HOME = testHome;
    globalThis.fetch = origFetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {
      /* Windows may briefly lock temp dirs */
    }
  });

  function setMockFetch(
    impl: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>,
  ): void {
    globalThis.fetch = impl as unknown as typeof globalThis.fetch;
  }

  test("readServerStatus — healthy server, no pid file", async () => {
    setMockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(url).toContain("/api/health");
      return new Response(JSON.stringify({
        pid: 1001,
        port: 17_001,
        running: true,
        runtime: "installed",
        source: "installed",
        url: "http://127.0.0.1:17001",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const status = await readServerStatus({ port: 17_001 });
    expect(status).toEqual({
      pid: 1001,
      running: true,
      port: 17_001,
      runtime: "installed",
      source: "installed",
      url: "http://127.0.0.1:17001",
    });
  });

  test("readServerStatus — no health, no pid file", async () => {
    setMockFetch(async () =>
      new Response(JSON.stringify({ running: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const status = await readServerStatus({ port: 17_002 });
    expect(status).toEqual({ running: false });
  });

  test("readServerStatus — stale pid file (process dead) + no health removes pid file", async () => {
    const port = 17_003;
    const pidPath = getServerPidFilePath({});
    mkdirSync(path.dirname(pidPath), { recursive: true });
    writeFileSync(
      pidPath,
      JSON.stringify({
        pid: 999_999_999,
        port,
        startedAt: new Date().toISOString(),
      }),
    );
    expect(existsSync(pidPath)).toBe(true);

    setMockFetch(async () =>
      new Response(JSON.stringify({ running: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const status = await readServerStatus({ port });
    expect(status).toEqual({ running: false });
    expect(existsSync(pidPath)).toBe(false);
  });

  test("readServerStatus — healthy + pid file with alive process", async () => {
    const port = 17_004;
    const pidPath = getServerPidFilePath({});
    mkdirSync(path.dirname(pidPath), { recursive: true });
    writeFileSync(
      pidPath,
      JSON.stringify({
        pid: process.pid,
        port,
        startedAt: new Date().toISOString(),
      }),
    );

    setMockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(url).toContain("/api/health");
      return new Response(JSON.stringify({
        pid: process.pid,
        port,
        running: true,
        runtime: "dev",
        source: "repo",
        url: `http://127.0.0.1:${port}`,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const status = await readServerStatus({ port });
    if (!status.running) expect.unreachable();
    expect(status.port).toBe(port);
    expect(status.pid).toBe(process.pid);
    expect(status.runtime).toBe("dev");
    expect(status.source).toBe("repo");
    expect(status.url).toBe(`http://127.0.0.1:${port}`);
  });

  test("startServer — missing port → exit 2 missing_required", async () => {
    await expect(startServer({})).rejects.toMatchObject({
      name: "CliError",
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("stopServer — no pid file → exit 1 no_managed_server", async () => {
    await expect(stopServer({ port: 17_005 })).rejects.toMatchObject({
      name: "CliError",
      exitCode: 1,
      details: expect.objectContaining({ code: CLI_ERR.noManagedServer }),
    });
  });

  test("stopServer — stale pid (dead process) removes pid file and throws stale_pid", async () => {
    const port = 17_006;
    const pidPath = getServerPidFilePath({});
    mkdirSync(path.dirname(pidPath), { recursive: true });
    writeFileSync(
      pidPath,
      JSON.stringify({
        pid: 999_999_998,
        port,
        startedAt: new Date().toISOString(),
      }),
    );

    try {
      await stopServer({ port });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      const ce = e as CliError;
      expect(ce.exitCode).toBe(1);
      expect(ce.details?.code).toBe(CLI_ERR.stalePid);
    }
    expect(existsSync(pidPath)).toBe(false);
  });
});
