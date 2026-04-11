/**
 * Opt-in: real TaskManager API + SQLite + subprocess hirotm (no stubs).
 * Isolated temp data/auth dirs and a child dev server — avoids touching dev `data/`.
 *
 * Enable: RUN_CLI_REAL_STACK=1 bun test ./src/cli/subprocess.real-stack.test.ts
 * Or: npm run test:cli:real-stack
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import {
  mkdirSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..", "..");
const hirotmEntry = path.join(repoRoot, "src", "cli", "bin", "hirotm.ts");
const prepareAuthScript = path.join(
  repoRoot,
  "src",
  "server",
  "scripts",
  "integrationPrepareAuth.ts",
);
const bootstrapDev = path.join(repoRoot, "src", "server", "bootstrapDev.ts");

const runRealStack =
  process.env.RUN_CLI_REAL_STACK === "1" ||
  process.env.RUN_CLI_REAL_STACK === "true";

function pickEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (addr && typeof addr === "object") {
        const p = addr.port;
        s.close(() => resolve(p));
      } else {
        s.close(() => reject(new Error("no port")));
      }
    });
    s.on("error", reject);
  });
}

async function readSubprocessStream(
  stream: ReturnType<typeof Bun.spawn>["stdout"],
): Promise<string> {
  if (stream == null || typeof stream === "number") return "";
  return await new Response(stream as ReadableStream<Uint8Array>).text();
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) {
        const j = (await r.json()) as { ok?: unknown };
        if (j.ok === true) return;
      }
    } catch {
      /* connection refused until server is up */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Health check failed for port ${port} within ${timeoutMs}ms`);
}

describe.skipIf(!runRealStack)("hirotm real stack (API + SQLite + subprocess)", () => {
  let rootDir: string;
  let dataDir: string;
  let authDir: string;
  let port: number;
  let serverProc: ReturnType<typeof Bun.spawn> | null = null;

  beforeEach(async () => {
    rootDir = mkdtempSync(path.join(tmpdir(), "hirotm-real-stack-"));
    dataDir = path.join(rootDir, "data");
    authDir = path.join(rootDir, "auth");
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(authDir, { recursive: true });
    port = await pickEphemeralPort();

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TASKMANAGER_DATA_DIR: dataDir,
      TASKMANAGER_AUTH_DIR: authDir,
      TASKMANAGER_PORT: String(port),
      TASKMANAGER_PROFILE: "default",
      HOME: rootDir,
    };

    const prep = Bun.spawn({
      cmd: ["bun", "run", prepareAuthScript],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env,
    });
    const prepCode = await prep.exited;
    if (prepCode !== 0) {
      const errOut = await readSubprocessStream(prep.stderr);
      throw new Error(`integrationPrepareAuth failed (${prepCode}): ${errOut}`);
    }

    serverProc = Bun.spawn({
      cmd: ["bun", "run", bootstrapDev],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env,
    });

    await waitForHealth(port, 30_000);
  });

  afterEach(() => {
    if (serverProc) {
      try {
        serverProc.kill();
      } catch {
        /* ignore */
      }
      serverProc = null;
    }
    try {
      rmSync(rootDir, { recursive: true, force: true });
    } catch {
      /* Windows may hold locks briefly */
    }
  });

  test("boards list returns NDJSON (empty DB → no stdout lines) via real GET /api/boards", async () => {
    const proc = Bun.spawn({
      cmd: [
        "bun",
        "run",
        hirotmEntry,
        "boards",
        "list",
        "-p",
        String(port),
      ],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: rootDir,
        TASKMANAGER_PROFILE: "default",
      },
    });
    const [stdout, stderr] = await Promise.all([
      readSubprocessStream(proc.stdout),
      readSubprocessStream(proc.stderr),
    ]);
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(stderr.trim()).toBe("");
    expect(stdout.trim()).toBe("");
  });

  test("statuses list returns seeded workflow rows", async () => {
    const proc = Bun.spawn({
      cmd: ["bun", "run", hirotmEntry, "statuses", "list", "-p", String(port)],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: rootDir,
        TASKMANAGER_PROFILE: "default",
      },
    });
    const [stdout, stderr] = await Promise.all([
      readSubprocessStream(proc.stdout),
      readSubprocessStream(proc.stderr),
    ]);
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(stderr.trim()).toBe("");
    const lines = stdout.trimEnd().split("\n").filter((l) => l.length > 0);
    const rows = lines.map((l) => JSON.parse(l) as { statusId: string });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(rows.map((r) => r.statusId));
    expect(ids.has("open")).toBe(true);
    expect(ids.has("in-progress")).toBe(true);
    expect(ids.has("closed")).toBe(true);
  });
});
