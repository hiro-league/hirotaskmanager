/**
 * Additional writeCommands coverage: lists, tasks, boards mutations, releases.
 * Complements `writeCommands.smoke.test.ts` (releases list/show, boards add).
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Board } from "../../shared/models";
import { CLI_ERR } from "./cli-error-codes";
import {
  runBoardsDelete,
  runBoardsGroups,
  runBoardsPriorities,
  runBoardsUpdate,
  runListsAdd,
  runListsDelete,
  runListsList,
  runListsMove,
  runListsUpdate,
  runReleasesAdd,
  runReleasesDelete,
  runReleasesUpdate,
  runTasksAdd,
  runTasksDelete,
  runTasksMove,
  runTasksUpdate,
} from "./writeCommands";

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

describe("writeCommands breadth — validation", () => {
  test("runListsAdd throws without --board", async () => {
    await expect(runListsAdd({ port: 1, board: undefined })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runListsList throws without --board", async () => {
    await expect(runListsList({ port: 1, board: undefined })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runTasksAdd throws without --list / --group", async () => {
    await expect(
      runTasksAdd({ port: 1, board: "b", list: undefined, group: "1" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
    await expect(
      runTasksAdd({ port: 1, board: "b", list: "1", group: undefined }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runBoardsUpdate throws without board id", async () => {
    await expect(runBoardsUpdate({ port: 1, board: undefined })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runBoardsUpdate throws when no update fields", async () => {
    await expect(runBoardsUpdate({ port: 1, board: "b" })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.noUpdateFields }),
    });
  });

  test("runListsUpdate throws without patch fields", async () => {
    await expect(
      runListsUpdate({ port: 1, board: "b", listId: "1" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.noUpdateFields }),
    });
  });

  test("runTasksUpdate throws without patch fields", async () => {
    await expect(
      runTasksUpdate({ port: 1, board: "b", taskId: "9" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.noUpdateFields }),
    });
  });

  test("runReleasesAdd throws without name", async () => {
    await expect(
      runReleasesAdd({ port: 1, board: "b", name: "" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runReleasesUpdate throws without patch fields", async () => {
    await expect(
      runReleasesUpdate({ port: 1, board: "b", releaseId: "1" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.noUpdateFields }),
    });
  });

  test("runListsMove throws on multiple placement flags", async () => {
    await expect(
      runListsMove({
        port: 1,
        board: "b",
        listId: "1",
        first: true,
        last: true,
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.mutuallyExclusiveOptions }),
    });
  });

  test("runTasksMove throws without --to-list", async () => {
    await expect(
      runTasksMove({ port: 1, board: "b", taskId: "1" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });
});

describe("writeCommands breadth — mock fetch happy paths", () => {
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
  });

  const jsonBoard = (
    b: Partial<Board> & { boardId: number; slug: string; name: string },
  ): Board =>
    ({
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      description: "",
      lists: [],
      tasks: [],
      ...b,
    }) as unknown as Board;

  test("runListsList GETs paginated /lists", async () => {
    const row = {
      listId: 9,
      name: "Todo",
      order: 0,
      color: "#fff",
      emoji: null,
      createdByPrincipal: "web",
      createdByLabel: null,
    };
    setMockFetch(async (input) => {
      expect(reqUrl(input)).toContain("/api/boards/lb/lists");
      expect(reqUrl(input)).not.toMatch(/\/lists\/\d/);
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
      runListsList({ port: 22009, board: "lb" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ listId: 9, name: "Todo" });
  });

  test("runListsAdd POSTs and prints writeSuccess", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/my/lists");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "my",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: { listId: 4, name: "Backlog", order: 0, emoji: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runListsAdd({ port: 22010, board: "my", name: "Backlog" }),
    );
    const p = JSON.parse(out.trim()) as { ok: boolean; entity: { type: string } };
    expect(p.ok).toBe(true);
    expect(p.entity.type).toBe("list");
  });

  test("runListsUpdate PATCHes list name", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b1/lists/2");
      expect(init?.method).toBe("PATCH");
      const body = JSON.parse(String(init?.body));
      expect(body.name).toBe("Renamed");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "b1",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: { listId: 2, name: "Renamed", order: 1, emoji: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runListsUpdate({
        port: 22011,
        board: "b1",
        listId: "2",
        name: "Renamed",
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runListsDelete DELETEs and prints trash envelope", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b1/lists/3");
      expect(init?.method).toBe("DELETE");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "b1",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          deletedListId: 3,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runListsDelete({ port: 22012, board: "b1", listId: "3" }),
    );
    const p = JSON.parse(out.trim()) as { trashed: { type: string } };
    expect(p.trashed.type).toBe("list");
  });

  test("runListsMove PUTs reorder body", async () => {
    const board = jsonBoard({
      boardId: 1,
      slug: "b",
      name: "B",
      lists: [{ listId: 5, name: "L", order: 0, emoji: null }],
    });
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b/lists/move");
      expect(init?.method).toBe("PUT");
      const body = JSON.parse(String(init?.body));
      expect(body.listId).toBe(5);
      expect(body.position).toBe("first");
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await captureStdout(() =>
      runListsMove({
        port: 22013,
        board: "b",
        listId: "5",
        first: true,
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runTasksAdd POSTs minimal task", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/brd/tasks");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.listId).toBe(1);
      expect(body.groupId).toBe(2);
      expect(body.title).toBe("Hello");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "brd",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: {
            taskId: 99,
            listId: 1,
            groupId: 2,
            title: "Hello",
            body: "",
            priorityId: 1,
            status: "open",
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runTasksAdd({
        port: 22014,
        board: "brd",
        list: "1",
        group: "2",
        title: "Hello",
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true, entity: { type: "task" } });
  });

  test("runTasksUpdate PATCHes title", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/brd/tasks/9");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toMatchObject({ title: "New" });
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "brd",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: {
            taskId: 9,
            listId: 1,
            groupId: 1,
            title: "New",
            body: "",
            priorityId: 1,
            status: "open",
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runTasksUpdate({
        port: 22015,
        board: "brd",
        taskId: "9",
        title: "New",
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runTasksDelete DELETEs and prints trash envelope", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/brd/tasks/8");
      expect(init?.method).toBe("DELETE");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "brd",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          deletedTaskId: 8,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runTasksDelete({ port: 22016, board: "brd", taskId: "8" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({
      trashed: { type: "task" },
    });
  });

  test("runTasksMove PUTs move body", async () => {
    const board = jsonBoard({
      boardId: 1,
      slug: "brd",
      name: "B",
      tasks: [
        {
          taskId: 7,
          listId: 2,
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
    });
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/brd/tasks/move");
      expect(init?.method).toBe("PUT");
      const body = JSON.parse(String(init?.body));
      expect(body.taskId).toBe(7);
      expect(body.toListId).toBe(2);
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await captureStdout(() =>
      runTasksMove({
        port: 22017,
        board: "brd",
        taskId: "7",
        toList: "2",
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runBoardsUpdate PATCHes name", async () => {
    const board = jsonBoard({
      boardId: 1,
      slug: "x",
      name: "Patched",
    });
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/x");
      expect(init?.method).toBe("PATCH");
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await captureStdout(() =>
      runBoardsUpdate({ port: 22018, board: "x", name: "Patched" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runBoardsDelete GET then DELETE", async () => {
    const board = jsonBoard({ boardId: 1, slug: "del", name: "D" });
    let phase = 0;
    setMockFetch(async (input, init) => {
      const url = reqUrl(input);
      if (url.includes("/boards/del") && init?.method === "DELETE") {
        phase += 1;
        return new Response(null, { status: 204 });
      }
      if (url.includes("/boards/del") && !init?.method) {
        phase += 1;
        return new Response(JSON.stringify(board), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("nope", { status: 404 });
    });
    const out = await captureStdout(() =>
      runBoardsDelete({ port: 22019, board: "del" }),
    );
    expect(phase).toBe(2);
    expect(JSON.parse(out.trim())).toMatchObject({
      trashed: { type: "board" },
    });
  });

  test("runBoardsGroups PATCH with empty patch arrays", async () => {
    const board = jsonBoard({ boardId: 1, slug: "g", name: "G" });
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/g/groups");
      expect(init?.method).toBe("PATCH");
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    // parsePatchBoardTaskGroupConfigBody requires default + fallback ids even when arrays are empty.
    const payload = JSON.stringify({
      creates: [],
      updates: [],
      deletes: [],
      defaultTaskGroupId: 1,
      deletedGroupFallbackId: 1,
    });
    const out = await captureStdout(() =>
      runBoardsGroups({ port: 22020, board: "g", json: payload }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runBoardsPriorities PATCH with empty array json", async () => {
    const board = jsonBoard({ boardId: 1, slug: "p", name: "P" });
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/p/priorities");
      expect(init?.method).toBe("PATCH");
      const body = JSON.parse(String(init?.body));
      expect(body.taskPriorities).toEqual([]);
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await captureStdout(() =>
      runBoardsPriorities({ port: 22021, board: "p", json: "[]" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runReleasesAdd POSTs release", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b/releases");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          releaseId: 3,
          name: "1.0",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runReleasesAdd({ port: 22022, board: "b", name: "1.0" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ releaseId: 3, name: "1.0" });
  });

  test("runReleasesUpdate PATCHes release", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b/releases/3");
      expect(init?.method).toBe("PATCH");
      return new Response(
        JSON.stringify({
          releaseId: 3,
          name: "1.1",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runReleasesUpdate({ port: 22023, board: "b", releaseId: "3", name: "1.1" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ name: "1.1" });
  });

  test("runReleasesDelete returns ok envelope on 204", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b/releases/2");
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    });
    const out = await captureStdout(() =>
      runReleasesDelete({ port: 22024, board: "b", releaseId: "2" }),
    );
    expect(JSON.parse(out.trim())).toEqual({
      ok: true,
      board: "b",
      deletedReleaseId: 2,
    });
  });
});
