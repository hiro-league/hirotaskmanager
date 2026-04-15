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

/** Real-stack tests use an isolated HOME; pin profile and port via argv on each hirotm/server spawn. */
const PROFILE_ARGS = ["--profile", "default", "--dev"] as const;

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
        const j = (await r.json()) as { running?: unknown; port?: unknown };
        if (j.running === true && j.port === port) return;
      }
    } catch {
      /* connection refused until server is up */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Health check failed for port ${port} within ${timeoutMs}ms`);
}

function parseNdjsonLines(stdout: string): Record<string, unknown>[] {
  return stdout
    .trimEnd()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

const CLIENT_NAME = ["--client-name", "Cursor Agent"];

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
      cmd: ["bun", bootstrapDev, ...PROFILE_ARGS, "--port", String(port)],
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

  async function runHirotm(
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn({
      cmd: [
        "bun",
        "run",
        hirotmEntry,
        ...PROFILE_ARGS,
        "--port",
        String(port),
        ...args,
      ],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: rootDir,
      },
    });
    const [stdout, stderr] = await Promise.all([
      readSubprocessStream(proc.stdout),
      readSubprocessStream(proc.stderr),
    ]);
    return { code: await proc.exited, stdout, stderr };
  }

  test("boards list returns NDJSON (empty DB → no stdout lines) via real GET /api/boards", async () => {
    const proc = Bun.spawn({
      cmd: [
        "bun",
        "run",
        hirotmEntry,
        ...PROFILE_ARGS,
        "--port",
        String(port),
        "boards",
        "list",
      ],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: rootDir,
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
      cmd: [
        "bun",
        "run",
        hirotmEntry,
        ...PROFILE_ARGS,
        "--port",
        String(port),
        "statuses",
        "list",
      ],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: rootDir,
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

  test("board CRUD round-trip (add → list → describe → update → delete)", async () => {
    const u = `brd-${Date.now()}`;
    const name1 = `Board-${u}`;
    let r = await runHirotm(["boards", "add", name1, ...CLIENT_NAME]);
    expect(r.code).toBe(0);

    r = await runHirotm(["boards", "list"]);
    expect(r.code).toBe(0);
    const boards = parseNdjsonLines(r.stdout);
    const row = boards.find((b) => b.name === name1);
    expect(row).toBeDefined();
    const slug = String(row!.slug);

    r = await runHirotm(["boards", "describe", slug]);
    expect(r.code).toBe(0);
    const bline = parseNdjsonLines(r.stdout).find((x) => x.kind === "board");
    expect(bline?.name).toBe(name1);

    const name2 = `Updated-${u}`;
    r = await runHirotm(["boards", "update", slug, "--name", name2, ...CLIENT_NAME]);
    expect(r.code).toBe(0);

    r = await runHirotm(["boards", "list"]);
    const row2 = parseNdjsonLines(r.stdout).find((b) => b.name === name2);
    expect(row2).toBeDefined();
    const slug2 = String(row2!.slug);

    r = await runHirotm(["boards", "delete", slug2, "--yes", ...CLIENT_NAME]);
    expect(r.code).toBe(0);
  });

  test("task CRUD round-trip (add → list → update → move → delete)", async () => {
    const u = `tsk-${Date.now()}`;
    let r = await runHirotm(["boards", "add", `TB-${u}`, ...CLIENT_NAME]);
    expect(r.code).toBe(0);
    r = await runHirotm(["boards", "list"]);
    const slug = String(
      parseNdjsonLines(r.stdout).find((b) => b.name === `TB-${u}`)!.slug,
    );

    r = await runHirotm(["lists", "add", "Lane1", "--board", slug, ...CLIENT_NAME]);
    expect(r.code).toBe(0);

    r = await runHirotm(["lists", "list", "--board", slug]);
    expect(r.code).toBe(0);
    const listsA = parseNdjsonLines(r.stdout);
    const listAId = String(listsA[0].listId);

    r = await runHirotm(["boards", "describe", slug]);
    const descRows = parseNdjsonLines(r.stdout);
    const groups = descRows.filter((x) => x.kind === "group");
    const defaultG = groups.find((g) => g.default === true) ?? groups[0];
    expect(defaultG).toBeDefined();
    const groupId = String(defaultG!.groupId);

    r = await runHirotm([
      "tasks",
      "add",
      "--board",
      slug,
      "--list",
      listAId,
      "--group",
      groupId,
      "--title",
      "T1",
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);
    const addEnv = JSON.parse(r.stdout.trim()) as {
      entity: { type: string; taskId: number };
    };
    expect(addEnv.entity.type).toBe("task");
    const taskId = String(addEnv.entity.taskId);

    r = await runHirotm(["tasks", "list", "--board", slug]);
    expect(r.code).toBe(0);
    expect(
      parseNdjsonLines(r.stdout).some(
        (t) => String(t.taskId) === taskId && t.title === "T1",
      ),
    ).toBe(true);

    r = await runHirotm([
      "tasks",
      "update",
      "--board",
      slug,
      taskId,
      "--title",
      "T2",
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);

    r = await runHirotm(["lists", "add", "SecondCol", "--board", slug, ...CLIENT_NAME]);
    expect(r.code).toBe(0);
    r = await runHirotm(["lists", "list", "--board", slug]);
    const listsB = parseNdjsonLines(r.stdout);
    const second = listsB.find((l) => l.name === "SecondCol");
    expect(second).toBeDefined();
    const listBId = String(second!.listId);

    r = await runHirotm([
      "tasks",
      "move",
      "--board",
      slug,
      "--to-list",
      listBId,
      taskId,
      "--last",
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);

    r = await runHirotm(["tasks", "list", "--board", slug, "--list", listBId]);
    expect(r.code).toBe(0);
    expect(
      parseNdjsonLines(r.stdout).some((t) => String(t.taskId) === taskId),
    ).toBe(true);

    r = await runHirotm(["tasks", "delete", "--board", slug, taskId, "--yes", ...CLIENT_NAME]);
    expect(r.code).toBe(0);
  });

  test("list CRUD round-trip (add → list → update → delete)", async () => {
    const u = `lst-${Date.now()}`;
    let r = await runHirotm(["boards", "add", `LB-${u}`, ...CLIENT_NAME]);
    expect(r.code).toBe(0);
    r = await runHirotm(["boards", "list"]);
    const slug = String(parseNdjsonLines(r.stdout)[0].slug);

    r = await runHirotm(["lists", "add", "MyColumn", "--board", slug, ...CLIENT_NAME]);
    expect(r.code).toBe(0);

    r = await runHirotm(["lists", "list", "--board", slug]);
    const myCol = parseNdjsonLines(r.stdout).find((l) => l.name === "MyColumn");
    expect(myCol).toBeDefined();
    const listId = String(myCol!.listId);

    r = await runHirotm([
      "lists",
      "update",
      "--board",
      slug,
      listId,
      "--name",
      "RenamedCol",
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);

    r = await runHirotm(["lists", "list", "--board", slug]);
    expect(
      parseNdjsonLines(r.stdout).some((l) => l.name === "RenamedCol"),
    ).toBe(true);

    r = await runHirotm([
      "lists",
      "delete",
      "--board",
      slug,
      listId,
      "--yes",
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);
  });

  test("release CRUD round-trip (add → list → show → update → delete)", async () => {
    const u = `rel-${Date.now()}`;
    let r = await runHirotm(["boards", "add", `RB-${u}`, ...CLIENT_NAME]);
    expect(r.code).toBe(0);
    r = await runHirotm(["boards", "list"]);
    const slug = String(parseNdjsonLines(r.stdout)[0].slug);

    r = await runHirotm([
      "releases",
      "add",
      "--board",
      slug,
      "--name",
      `v1-${u}`,
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);

    r = await runHirotm(["releases", "list", "--board", slug]);
    expect(r.code).toBe(0);
    const relRow = parseNdjsonLines(r.stdout).find(
      (x) => x.name === `v1-${u}`,
    );
    expect(relRow).toBeDefined();
    const releaseId = String(relRow!.releaseId);

    r = await runHirotm(["releases", "show", "--board", slug, releaseId]);
    expect(r.code).toBe(0);
    const show = JSON.parse(r.stdout.trim()) as { name?: string };
    expect(show.name).toBe(`v1-${u}`);

    r = await runHirotm([
      "releases",
      "update",
      "--board",
      slug,
      releaseId,
      "--name",
      `v1.1-${u}`,
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);

    r = await runHirotm([
      "releases",
      "delete",
      "--board",
      slug,
      releaseId,
      "--yes",
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);
  });

  test("query search finds a task created on the stack", async () => {
    // FTS5 MATCH treats `-` as syntax; keep the query alphanumeric (see search route catch → 400).
    const u = `q${Date.now()}`;
    const token = `SearchableToken${u}`;
    let r = await runHirotm(["boards", "add", `QB-${u}`, ...CLIENT_NAME]);
    expect(r.code).toBe(0);
    r = await runHirotm(["boards", "list"]);
    const slug = String(
      parseNdjsonLines(r.stdout).find((b) => b.name === `QB-${u}`)!.slug,
    );

    r = await runHirotm(["lists", "add", "SearchLane", "--board", slug, ...CLIENT_NAME]);
    expect(r.code).toBe(0);
    r = await runHirotm(["lists", "list", "--board", slug]);
    expect(r.code).toBe(0);
    const listId = String(parseNdjsonLines(r.stdout)[0].listId);

    r = await runHirotm(["boards", "describe", slug]);
    const descRows = parseNdjsonLines(r.stdout);
    const groups = descRows.filter((x) => x.kind === "group");
    const groupId = String((groups.find((g) => g.default === true) ?? groups[0])!.groupId);

    r = await runHirotm([
      "tasks",
      "add",
      "--board",
      slug,
      "--list",
      listId,
      "--group",
      groupId,
      "--title",
      token,
      ...CLIENT_NAME,
    ]);
    expect(r.code).toBe(0);

    r = await runHirotm(["query", "search", token]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(token);
  });

  test("trash restore round-trip for a board", async () => {
    const u = `tr-${Date.now()}`;
    let r = await runHirotm(["boards", "add", `TrashBoard-${u}`, ...CLIENT_NAME]);
    expect(r.code).toBe(0);
    r = await runHirotm(["boards", "list"]);
    const row = parseNdjsonLines(r.stdout).find(
      (b) => b.name === `TrashBoard-${u}`,
    );
    expect(row).toBeDefined();
    const slug = String(row!.slug);
    const boardId = String(row!.boardId);

    r = await runHirotm(["boards", "delete", slug, "--yes", ...CLIENT_NAME]);
    expect(r.code).toBe(0);

    r = await runHirotm(["trash", "list", "boards"]);
    expect(r.code).toBe(0);
    expect(parseNdjsonLines(r.stdout).some((b) => String(b.boardId) === boardId)).toBe(
      true,
    );

    r = await runHirotm(["boards", "restore", boardId, "--yes", ...CLIENT_NAME]);
    expect(r.code).toBe(0);

    r = await runHirotm(["boards", "list"]);
    expect(
      parseNdjsonLines(r.stdout).some((b) => String(b.boardId) === boardId),
    ).toBe(true);
  });

  test("boards list --format human prints a table for real data", async () => {
    const u = `hm-${Date.now()}`;
    let r = await runHirotm(["boards", "add", `Human-${u}`, ...CLIENT_NAME]);
    expect(r.code).toBe(0);

    r = await runHirotm(["boards", "list", "--format", "human"]);
    expect(r.code).toBe(0);
    expect(r.stderr.trim()).toBe("");
    expect(r.stdout).toContain(`Human-${u}`);
  });

  test("boards list --quiet prints slug only (plain text)", async () => {
    const u = `qt-${Date.now()}`;
    let r = await runHirotm(["boards", "add", `Quiet-${u}`, ...CLIENT_NAME]);
    expect(r.code).toBe(0);
    r = await runHirotm(["boards", "list"]);
    const slug = String(
      parseNdjsonLines(r.stdout).find((b) => b.name === `Quiet-${u}`)!.slug,
    );

    r = await runHirotm(["boards", "list", "--quiet"]);
    expect(r.code).toBe(0);
    expect(r.stderr.trim()).toBe("");
    expect(r.stdout.trim().split("\n").some((line) => line.trim() === slug)).toBe(
      true,
    );
  });
});

describe.skipIf(!runRealStack)("hirotm real stack — unreachable port", () => {
  test("boards list with no server on port exits 6 (server_unreachable)", async () => {
    const deadPort = await pickEphemeralPort();
    const rootDir = mkdtempSync(path.join(tmpdir(), "hirotm-unreachable-"));
    const origHome = process.env.HOME;
    process.env.HOME = rootDir;
    try {
      const proc = Bun.spawn({
        cmd: [
          "bun",
          "run",
          hirotmEntry,
          ...PROFILE_ARGS,
          "--port",
          String(deadPort),
          "boards",
          "list",
        ],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          HOME: rootDir,
        },
      });
      const stderr = await readSubprocessStream(proc.stderr);
      const code = await proc.exited;
      expect(code).toBe(6);
      const err = JSON.parse(stderr.trim()) as { code?: string };
      expect(err.code).toBe("server_unreachable");
    } finally {
      if (origHome !== undefined) process.env.HOME = origHome;
      else delete process.env.HOME;
      try {
        rmSync(rootDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});
