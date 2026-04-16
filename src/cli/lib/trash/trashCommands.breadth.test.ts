/**
 * Trash writeCommands coverage beyond `trashCommands.fetch.test.ts` (runTrashBoards).
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Board } from "../../../shared/models";
import { createDefaultCliContext } from "../../handlers/context";
import { CLI_ERR } from "../../types/errors";
import { resetCliOutputFormat } from "../output/output";
import {
  runBoardsPurge,
  runBoardsRestore,
  runListsPurge,
  runListsRestore,
  runTasksPurge,
  runTasksRestore,
  runTrashLists,
  runTrashTasks,
} from "./trashCommands";

const ctx = createDefaultCliContext();

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let buf = "";
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: string | Uint8Array,
    ..._args: unknown[]
  ): boolean => {
    buf +=
      typeof chunk === "string"
        ? chunk
        : new TextDecoder().decode(chunk);
    return true;
  };
  try {
    await run();
  } finally {
    process.stdout.write = orig;
  }
  return buf;
}

function reqUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : (input as Request).url;
}

describe("trashCommands breadth — validation", () => {
  test("runBoardsRestore throws without board ref", async () => {
    await expect(runBoardsRestore(ctx, { port: 1, board: undefined })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runListsRestore throws on invalid list id", async () => {
    await expect(runListsRestore(ctx, { port: 1, listId: "x" })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
    });
  });
});

describe("trashCommands breadth — mock fetch", () => {
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

  const boardWithList = (listId: number): Board =>
    ({
      boardId: 10,
      slug: "b",
      name: "B",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      description: "",
      lists: [{ listId, name: "L", order: 0 }],
      tasks: [],
    }) as unknown as Board;

  const boardWithTask = (taskId: number): Board =>
    ({
      boardId: 10,
      slug: "b",
      name: "B",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      description: "",
      lists: [],
      tasks: [
        {
          taskId,
          listId: 1,
          groupId: 1,
          title: "T",
          body: "",
          priorityId: 1,
          status: "open",
          order: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }) as unknown as Board;

  test("runTrashLists prints JSON rows", async () => {
    setMockFetch(async (input) => {
      expect(reqUrl(input)).toContain("/api/trash/lists");
      const body = {
        items: [
          {
            type: "list" as const,
            listId: 1,
            name: "L",
            emoji: null,
            boardId: 1,
            boardName: "B",
            boardDeletedAt: null,
            deletedAt: "",
            canRestore: true,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await captureStdout(() => runTrashLists(ctx, { port: 22100 }));
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      type: "list",
      listId: 1,
      name: "L",
      emoji: null,
      boardId: 1,
      boardName: "B",
      boardDeletedAt: null,
      deletedAt: "",
      canRestore: true,
    });
  });

  test("runTrashTasks prints JSON rows", async () => {
    setMockFetch(async (input) => {
      expect(reqUrl(input)).toContain("/api/trash/tasks");
      const body = {
        items: [
          {
            type: "task" as const,
            taskId: 2,
            title: "X",
            emoji: null,
            boardId: 1,
            boardName: "B",
            boardDeletedAt: null,
            listId: 1,
            listName: "L",
            listDeletedAt: null,
            deletedAt: "",
            canRestore: true,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await captureStdout(() => runTrashTasks(ctx, { port: 22101 }));
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      type: "task",
      taskId: 2,
      title: "X",
      emoji: null,
      boardId: 1,
      boardName: "B",
      boardDeletedAt: null,
      listId: 1,
      listName: "L",
      listDeletedAt: null,
      deletedAt: "",
      canRestore: true,
    });
  });

  test("runBoardsRestore numeric id: POST restore then GET board", async () => {
    const board = {
      boardId: 5,
      slug: "rest",
      name: "R",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      description: "",
      lists: [],
      tasks: [],
    } as unknown as Board;
    setMockFetch(async (input, init) => {
      const u = reqUrl(input);
      if (u.includes("/trash/boards/7/restore")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({ boardId: 5, boardUpdatedAt: "2026-01-02T00:00:00.000Z" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (u.includes("/api/boards/5")) {
        return new Response(JSON.stringify(board), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const out = await captureStdout(() =>
      runBoardsRestore(ctx, { port: 22102, board: "7" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true, entity: { type: "board" } });
  });

  test("runBoardsPurge DELETE trash/boards/:id", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/trash/boards/7");
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    });
    const out = await captureStdout(() =>
      runBoardsPurge(ctx, { port: 22103, board: "7" }),
    );
    expect(JSON.parse(out.trim())).toEqual({
      ok: true,
      purged: { type: "board", boardId: 7 },
    });
  });

  test("runListsRestore POST then GET board with list", async () => {
    const board = boardWithList(3);
    setMockFetch(async (input, init) => {
      const u = reqUrl(input);
      if (u.includes("/trash/lists/3/restore")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            boardId: 10,
            boardUpdatedAt: "2026-01-02T00:00:00.000Z",
            listId: 3,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (u.includes("/api/boards/10")) {
        return new Response(JSON.stringify(board), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const out = await captureStdout(() =>
      runListsRestore(ctx, { port: 22104, listId: "3" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true, entity: { type: "list" } });
  });

  test("runListsPurge DELETE trash/lists/:id", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/trash/lists/3");
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    });
    const out = await captureStdout(() =>
      runListsPurge(ctx, { port: 22105, listId: "3" }),
    );
    expect(JSON.parse(out.trim())).toEqual({
      ok: true,
      purged: { type: "list", listId: 3 },
    });
  });

  test("runTasksRestore POST then GET board with task", async () => {
    const board = boardWithTask(9);
    setMockFetch(async (input, init) => {
      const u = reqUrl(input);
      if (u.includes("/trash/tasks/9/restore")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            boardId: 10,
            boardUpdatedAt: "2026-01-02T00:00:00.000Z",
            taskId: 9,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (u.includes("/api/boards/10")) {
        return new Response(JSON.stringify(board), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const out = await captureStdout(() =>
      runTasksRestore(ctx, { port: 22106, taskId: "9" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true, entity: { type: "task" } });
  });

  test("runTasksPurge DELETE trash/tasks/:id", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/trash/tasks/9");
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    });
    const out = await captureStdout(() =>
      runTasksPurge(ctx, { port: 22107, taskId: "9" }),
    );
    expect(JSON.parse(out.trim())).toEqual({
      ok: true,
      purged: { type: "task", taskId: 9 },
    });
  });
});
