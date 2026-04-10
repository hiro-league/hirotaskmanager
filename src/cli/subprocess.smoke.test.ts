/**
 * Aspect 4 — integration depth: subprocess smoke.
 * Spawns the real `hirotm` entry (argv → Commander → handlers) to catch wiring issues
 * that in-process handler tests miss.
 */
import { describe, expect, test } from "bun:test";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..", "..");
const hirotmEntry = path.join(repoRoot, "src", "cli", "bin", "hirotm.ts");

async function readSubprocessStream(
  stream: ReturnType<typeof Bun.spawn>["stdout"],
): Promise<string> {
  // When `stdout: "pipe"`, Bun exposes a ReadableStream; types also allow fd numbers.
  if (stream == null || typeof stream === "number") return "";
  return await new Response(stream as ReadableStream<Uint8Array>).text();
}

function spawnHirotm(
  args: string[],
  envOverrides?: Record<string, string>,
): ReturnType<typeof Bun.spawn> {
  return Bun.spawn({
    cmd: ["bun", "run", hirotmEntry, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env:
      envOverrides == null
        ? process.env
        : { ...process.env, ...envOverrides },
  });
}

describe("hirotm subprocess smoke (aspect 4)", () => {
  test("boards list hits stub API and prints paginated JSON on stdout (exit 0)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              items: [],
              total: 0,
              limit: 0,
              offset: 0,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const port = server.port;
      const proc = spawnHirotm(["boards", "list", "-p", String(port)]);
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(stdout.trimEnd().split("\n").length).toBe(1);
      const parsed: unknown = JSON.parse(stdout.trim());
      expect(parsed).toEqual({
        items: [],
        total: 0,
        limit: 0,
        offset: 0,
      });
    } finally {
      server.stop();
    }
  });

  test("boards list --pretty → multi-line stdout JSON (exit 0)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              items: [{ id: 1, name: "A" }],
              total: 1,
              limit: 1,
              offset: 0,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const port = server.port;
      const proc = spawnHirotm([
        "boards",
        "list",
        "-p",
        String(port),
        "--pretty",
      ]);
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(stdout.trim().split("\n").length).toBeGreaterThan(1);
      expect(JSON.parse(stdout.trim())).toEqual({
        items: [{ id: 1, name: "A" }],
        total: 1,
        limit: 1,
        offset: 0,
      });
    } finally {
      server.stop();
    }
  });

  test("boards list with no server → exit 6 and stderr JSON contract", async () => {
    const proc = spawnHirotm(["boards", "list", "-p", "59123"]);
    const [stdout, stderr] = await Promise.all([
      readSubprocessStream(proc.stdout),
      readSubprocessStream(proc.stderr),
    ]);
    const code = await proc.exited;

    expect(code).toBe(6);
    expect(stdout.trim()).toBe("");
    expect(stderr.trim().split("\n").length).toBe(1);
    const err = JSON.parse(stderr.trim()) as Record<string, unknown>;
    expect(err.error).toBeDefined();
    expect(err.code).toBe("server_unreachable");
    expect(err.retryable).toBe(true);
    expect(String(err.hint ?? "")).toContain("hirotm");
  });

  test("--help exits 0 (bootstrap + Commander)", async () => {
    const proc = spawnHirotm(["--help"]);
    const stdout = await readSubprocessStream(proc.stdout);
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout.toLowerCase()).toContain("hirotm");
    expect(stdout).toContain("--pretty");
  });

  test("boards --help and query search --help (aspect 3 discoverability spot-check)", async () => {
    const boards = spawnHirotm(["boards", "--help"]);
    const boardsOut = await readSubprocessStream(boards.stdout);
    expect(await boards.exited).toBe(0);
    expect(boardsOut).toContain("Usage:");
    expect(boardsOut.toLowerCase()).toContain("boards");

    const qsearch = spawnHirotm(["query", "search", "--help"]);
    const qsOut = await readSubprocessStream(qsearch.stdout);
    expect(await qsearch.exited).toBe(0);
    expect(qsOut).toContain("Usage:");
    expect(qsOut).toContain("--board");
  });

  test("handler validation: empty query → exit 2 and stderr JSON (no server)", async () => {
    const proc = spawnHirotm(["query", "search", "-p", "59998", ""]);
    const [stdout, stderr] = await Promise.all([
      readSubprocessStream(proc.stdout),
      readSubprocessStream(proc.stderr),
    ]);
    const code = await proc.exited;

    expect(code).toBe(2);
    expect(stdout.trim()).toBe("");
    const err = JSON.parse(stderr.trim()) as Record<string, unknown>;
    expect(err.error).toBe("Query required");
    expect(err.code).toBe("missing_required");
  });

  test("Commander missing required argument → exit 1 (boards show)", async () => {
    const proc = spawnHirotm(["boards", "show"]);
    const [stdout, stderr] = await Promise.all([
      readSubprocessStream(proc.stdout),
      readSubprocessStream(proc.stderr),
    ]);
    const code = await proc.exited;

    expect(code).toBe(1);
    expect(stdout.trim()).toBe("");
    // Commander prints plain text; project contract prefers exit 2 for usage (see docs/cli-error-handling.md).
    expect(stderr).toContain("missing required argument");
  });

  test("boards list with stub 403 → exit 4 and stderr JSON (aspect 3 + 6)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({ error: "denied", code: "forbidden" }),
            {
              status: 403,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const proc = spawnHirotm(["boards", "list", "-p", String(server.port)]);
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(4);
      expect(stdout.trim()).toBe("");
      const err = JSON.parse(stderr.trim()) as Record<string, unknown>;
      expect(err.error).toBe("denied");
      expect(err.code).toBe("forbidden");
    } finally {
      server.stop();
    }
  });
});
