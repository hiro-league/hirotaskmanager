/**
 * Aspect 4 — integration depth: subprocess smoke.
 * Spawns the real `hirotm` entry (argv → Commander → handlers) to catch wiring issues
 * that in-process handler tests miss.
 */
import { describe, expect, test } from "bun:test";
import path from "node:path";
import { TASK_MANAGER_CLIENT_NAME_HEADER } from "../shared/boardCliAccess";

const repoRoot = path.resolve(import.meta.dir, "..", "..");
const hirotmEntry = path.join(repoRoot, "src", "cli", "bin", "hirotm.ts");

function withPort(port: number | undefined, args: string[]): string[] {
  if (port === undefined || !Number.isFinite(port)) {
    throw new Error("withPort: expected a listening port from Bun.serve");
  }
  return ["--port", String(port), ...args];
}

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
  test("boards list hits stub API and prints NDJSON stdout (empty page → no lines) (exit 0)", async () => {
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
      const proc = spawnHirotm(withPort(port, ["boards", "list"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      // Default list output is NDJSON; empty page emits no lines.
      expect(stdout.trim()).toBe("");
    } finally {
      server.stop();
    }
  });

  test("boards list --format human → fixed-width table stdout (exit 0)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              items: [
                {
                  boardId: 1,
                  slug: "a",
                  name: "Alpha",
                  emoji: null,
                },
              ],
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
      const proc = spawnHirotm(withPort(port, ["boards", "list", "--format", "human"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(stdout).toContain("Slug");
      expect(stdout).toContain("Alpha");
      expect(stdout).toContain("total 1");
    } finally {
      server.stop();
    }
  });

  test("boards list --quiet → one slug per line (exit 0)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              items: [
                {
                  boardId: 1,
                  slug: "a",
                  name: "Alpha",
                  emoji: null,
                },
              ],
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
      const proc = spawnHirotm(withPort(port, ["--quiet", "boards", "list"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(stdout.trimEnd()).toBe("a");
    } finally {
      server.stop();
    }
  });

  test("boards list --quiet --format human → exit 2 (stdout not JSON)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("unused", { status: 500 });
      },
    });

    try {
      const proc = spawnHirotm(
        withPort(server.port, ["--quiet", "--format", "human", "boards", "list"]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(2);
      expect(stdout.trim()).toBe("");
      // Global --format human → stderr is plain text, not JSON (same as other human-mode errors).
      expect(stderr).toContain("--quiet");
      expect(stderr).toContain("ndjson");
    } finally {
      server.stop();
    }
  });

  test("boards list with no server → exit 6 and stderr JSON contract", async () => {
    const proc = spawnHirotm(withPort(59123, ["boards", "list"]));
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
    expect(stdout).toContain("--format");
    expect(stdout).toContain("--quiet");
    expect(stdout).toContain("--port");
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
    const proc = spawnHirotm(withPort(59998, ["query", "search", ""]));
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

  test("Commander missing required argument → exit 1 (boards describe)", async () => {
    const proc = spawnHirotm(["boards", "describe"]);
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

  test("boards delete without --yes (piped stdin) → exit 2 confirmation_required", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("unused", { status: 500 });
      },
    });

    try {
      const proc = spawnHirotm(withPort(server.port, ["boards", "delete", "x"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(2);
      expect(stdout.trim()).toBe("");
      expect(stderr).toContain("boards delete");
      expect(stderr).toContain("Trash");
      const lines = stderr.trim().split("\n").filter((l) => l.length > 0);
      const jsonLine = lines[lines.length - 1]!;
      const err = JSON.parse(jsonLine) as Record<string, unknown>;
      expect(err.code).toBe("confirmation_required");
      expect(String(err.hint ?? "")).toContain("--yes");
    } finally {
      server.stop();
    }
  });

  test("boards delete --yes with stub API → exit 0 and stdout JSON", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards/x" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              boardId: 1,
              slug: "x",
              name: "X",
              emoji: null,
              description: "",
              lists: [],
              tasks: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (u.pathname === "/api/boards/x" && req.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const proc = spawnHirotm(withPort(server.port, ["boards", "delete", "x", "--yes"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      const line = stdout.trim().split("\n").filter((l) => l.length > 0);
      expect(line.length).toBeGreaterThanOrEqual(1);
      const row = JSON.parse(line[0]!) as Record<string, unknown>;
      expect(row.ok).toBe(true);
    } finally {
      server.stop();
    }
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
      const proc = spawnHirotm(withPort(server.port, ["boards", "list"]));
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

  test("boards list + stub 401 → exit 10, stderr JSON unauthenticated", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              error: "unauthenticated",
              code: "unauthenticated",
            }),
            {
              status: 401,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const proc = spawnHirotm(withPort(server.port, ["boards", "list"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(10);
      expect(stdout.trim()).toBe("");
      const err = JSON.parse(stderr.trim()) as Record<string, unknown>;
      expect(err.code).toBe("unauthenticated");
    } finally {
      server.stop();
    }
  });

  test("boards list + stub 404 → exit 3, stderr JSON not_found", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({ error: "not found", code: "not_found" }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const proc = spawnHirotm(withPort(server.port, ["boards", "list"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(3);
      expect(stdout.trim()).toBe("");
      const err = JSON.parse(stderr.trim()) as Record<string, unknown>;
      expect(err.code).toBe("not_found");
    } finally {
      server.stop();
    }
  });

  test("boards list + stub 409 → exit 5, stderr JSON conflict", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({ error: "conflict", code: "conflict" }),
            {
              status: 409,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const proc = spawnHirotm(withPort(server.port, ["boards", "list"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(5);
      expect(stdout.trim()).toBe("");
      const err = JSON.parse(stderr.trim()) as Record<string, unknown>;
      expect(err.code).toBe("conflict");
    } finally {
      server.stop();
    }
  });

  test("tasks add + stub POST 200 → exit 0, stdout ok true", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (
          u.pathname === "/api/boards/b/tasks" &&
          req.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              boardId: 1,
              boardSlug: "b",
              boardUpdatedAt: "2026-01-02T00:00:00.000Z",
              entity: {
                taskId: 42,
                listId: 1,
                groupId: 1,
                title: "Hello",
                body: "",
                priorityId: 1,
                status: "open",
                order: 0,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
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
      const proc = spawnHirotm(
        withPort(server.port, [
          "tasks",
          "add",
          "--board",
          "b",
          "--list",
          "1",
          "--group",
          "1",
          "--title",
          "Hello",
        ]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      const row = JSON.parse(stdout.trim()) as Record<string, unknown>;
      expect(row.ok).toBe(true);
    } finally {
      server.stop();
    }
  });

  test("lists add + stub POST 200 → exit 0, stdout envelope", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards/b/lists" && req.method === "POST") {
          return new Response(
            JSON.stringify({
              boardId: 1,
              boardSlug: "b",
              boardUpdatedAt: "2026-01-02T00:00:00.000Z",
              entity: {
                listId: 9,
                name: "Backlog",
                order: 0,
                emoji: null,
              },
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
      const proc = spawnHirotm(
        withPort(server.port, ["lists", "add", "--board", "b", "Backlog"]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      const row = JSON.parse(stdout.trim()) as Record<string, unknown>;
      expect(row.ok).toBe(true);
      expect((row.entity as Record<string, unknown>).type).toBe("list");
    } finally {
      server.stop();
    }
  });

  test("releases list + stub GET paginated → exit 0, NDJSON lines", async () => {
    const rel = {
      releaseId: 1,
      name: "1.0",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (
          u.pathname === "/api/boards/b/releases" &&
          req.method === "GET"
        ) {
          return new Response(
            JSON.stringify({
              items: [rel],
              total: 1,
              limit: 50,
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
      const proc = spawnHirotm(
        withPort(server.port, ["releases", "list", "--board", "b"]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      const lines = stdout.trimEnd().split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({ releaseId: 1, name: "1.0" });
    } finally {
      server.stop();
    }
  });

  test("statuses list + stub GET array → exit 0, NDJSON lines", async () => {
    const row = {
      statusId: "open",
      label: "Open",
      sortOrder: 0,
      isClosed: false,
    };
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/statuses" && req.method === "GET") {
          return new Response(JSON.stringify([row]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const proc = spawnHirotm(withPort(server.port, ["statuses", "list"]));
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      const lines = stdout.trimEnd().split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({ statusId: "open" });
    } finally {
      server.stop();
    }
  });

  test("query search human + stub GET /search → exit 0, table has Board header", async () => {
    const hit = {
      taskId: 1,
      boardId: 1,
      boardSlug: "b",
      boardName: "B",
      listId: 1,
      listName: "L",
      title: "Task",
      snippet: "…test…",
      score: 0.1,
    };
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/search" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              items: [hit],
              total: 1,
              limit: 20,
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
      const proc = spawnHirotm(
        withPort(server.port, ["query", "search", "test", "--format", "human"]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(stdout).toContain("Board");
      expect(stdout).toContain("b");
    } finally {
      server.stop();
    }
  });

  test("tasks list --board b + stub GET paginated → exit 0, NDJSON", async () => {
    const task = {
      taskId: 7,
      listId: 1,
      groupId: 1,
      title: "T",
      body: "",
      priorityId: 1,
      status: "open",
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (
          u.pathname === "/api/boards/b/tasks" &&
          req.method === "GET"
        ) {
          return new Response(
            JSON.stringify({
              items: [task],
              total: 1,
              limit: 500,
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
      const proc = spawnHirotm(
        withPort(server.port, ["tasks", "list", "--board", "b"]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      const lines = stdout.trimEnd().split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({ taskId: 7, title: "T" });
    } finally {
      server.stop();
    }
  });

  test("boards list --fields boardId → NDJSON lines only project boardId", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              items: [
                {
                  boardId: 1,
                  slug: "a",
                  name: "Alpha",
                  emoji: null,
                },
              ],
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
      const proc = spawnHirotm(
        withPort(server.port, ["boards", "list", "--fields", "boardId"]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      const lines = stdout.trimEnd().split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBe(1);
      const obj = JSON.parse(lines[0]!) as Record<string, unknown>;
      expect(Object.keys(obj).sort()).toEqual(["boardId"]);
      expect(obj.boardId).toBe(1);
    } finally {
      server.stop();
    }
  });

  test("--client-name is sent as X-TaskManager-Client-Name on API requests", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/api/boards" && req.method === "GET") {
          const name = req.headers.get(TASK_MANAGER_CLIENT_NAME_HEADER);
          expect(name).toBe("Agent");
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
      const proc = spawnHirotm(
        withPort(server.port, ["--client-name", "Agent", "boards", "list"]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(stdout.trim()).toBe("");
    } finally {
      server.stop();
    }
  });

  test("boards list --format human + empty stub → stdout contains No rows.", async () => {
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
      const proc = spawnHirotm(
        withPort(server.port, ["boards", "list", "--format", "human"]),
      );
      const [stdout, stderr] = await Promise.all([
        readSubprocessStream(proc.stdout),
        readSubprocessStream(proc.stderr),
      ]);
      const code = await proc.exited;

      expect(code).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(stdout).toContain("No rows.");
    } finally {
      server.stop();
    }
  });
});
