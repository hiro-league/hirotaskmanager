import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "bun:test";
import type { Board } from "../../../shared/models";
import { createDefaultCliContext } from "../../handlers/context";
import { CLI_ERR } from "../../types/errors";
import { resetCliOutputFormat } from "../output/output";
import { captureStdout } from "../core/testHelpers";
import {
  runBoardsAdd,
  runListsList,
  runReleasesList,
  runReleasesShow,
} from "./writeCommands";

const ctx = createDefaultCliContext();

describe("writeCommands smoke (mock fetch)", () => {
  const origFetch = globalThis.fetch;

  function setMockFetch(
    impl: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>,
  ): void {
    globalThis.fetch = impl as unknown as typeof globalThis.fetch;
  }

  afterEach(() => {
    globalThis.fetch = origFetch;
    resetCliOutputFormat();
  });

  test("runReleasesList prints JSON from GET releases", async () => {
    const rel = { id: 1, name: "R1", createdAt: "2026-01-01T00:00:00.000Z" };
    const envelope = {
      items: [rel],
      total: 1,
      limit: 1,
      offset: 0,
    };
    setMockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(url).toContain("/api/boards/brd/releases");
      return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const out = await captureStdout(() =>
      runReleasesList(ctx, { port: 21001, board: "brd" }),
    );
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual(rel);
  });

  test("runReleasesList throws when board missing", async () => {
    await expect(runReleasesList(ctx, { port: 1, board: undefined })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runListsList prints JSON lines from GET lists", async () => {
    const row = {
      listId: 4,
      name: "Backlog",
      order: 1,
      emoji: null,
    };
    setMockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(url).toContain("/api/boards/brd/lists");
      return new Response(
        JSON.stringify({
          items: [row],
          total: 1,
          limit: 1,
          offset: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runListsList(ctx, { port: 21002, board: "brd" }),
    );
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toMatchObject(row);
  });

  test("runReleasesShow prints single release when releaseId matches", async () => {
    setMockFetch(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              releaseId: 2,
              name: "Hit",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
              releaseId: 3,
              name: "Miss",
              createdAt: "2026-01-02T00:00:00.000Z",
            },
          ],
          total: 2,
          limit: 2,
          offset: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const out = await captureStdout(() =>
      runReleasesShow(ctx, { port: 21002, board: "b", releaseId: "2" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({
      releaseId: 2,
      name: "Hit",
    });
  });

  test("runReleasesShow throws when release id missing from list", async () => {
    setMockFetch(async () =>
      new Response(
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
      ),
    );

    await expect(
      runReleasesShow(ctx, { port: 21003, board: "b", releaseId: "99" }),
    ).rejects.toMatchObject({
      exitCode: 3,
      details: expect.objectContaining({ code: CLI_ERR.notFound }),
    });
  });

  test("runBoardsAdd POSTs and prints writeSuccess envelope", async () => {
    const board = {
      boardId: 10,
      slug: "new-board",
      name: "New Board",
      emoji: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    } as unknown as Board;

    setMockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      expect(body.name).toBe("MyBoard");
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const out = await captureStdout(() =>
      runBoardsAdd(ctx, { port: 21004, name: "MyBoard" }),
    );
    const parsed = JSON.parse(out.trim()) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect(parsed.boardId).toBe(10);
    expect(parsed.entity).toMatchObject({
      type: "board",
      boardId: 10,
      slug: "new-board",
      name: "New Board",
    });
  });

  test("runBoardsAdd POSTs emoji and description in JSON body", async () => {
    const board = {
      boardId: 11,
      slug: "emoji-board",
      name: "Emoji Board",
      emoji: "🚀",
      description: "Hello desc",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    } as unknown as Board;

    setMockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      expect(body.name).toBe("Named");
      expect(body.emoji).toBe("🚀");
      expect(body.description).toBe("Line one");
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const out = await captureStdout(() =>
      runBoardsAdd(ctx, {
        port: 21005,
        name: "Named",
        emoji: "🚀",
        description: "Line one",
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true, boardId: 11 });
  });

  test("runBoardsAdd reads description from --description-file", async () => {
    const board = {
      boardId: 12,
      slug: "file-board",
      name: "File Board",
      emoji: null,
      description: "from file",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    } as unknown as Board;

    const dir = mkdtempSync(join(tmpdir(), "hirotm-boards-add-"));
    const path = join(dir, "desc.txt");
    writeFileSync(path, "  from file\n", "utf8");
    try {
      setMockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("POST");
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        expect(body.description).toBe("from file");
        return new Response(JSON.stringify(board), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

      const out = await captureStdout(() =>
        runBoardsAdd(ctx, {
          port: 21006,
          name: "File Board",
          descriptionFile: path,
        }),
      );
      expect(JSON.parse(out.trim())).toMatchObject({ ok: true, boardId: 12 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
