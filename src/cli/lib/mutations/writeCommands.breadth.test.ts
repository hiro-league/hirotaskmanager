/**
 * Additional writeCommands coverage: lists, tasks, boards mutations, releases.
 * Complements `writeCommands.smoke.test.ts` (releases list/show, boards add).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "bun:test";
import { TASK_MANAGER_CLIENT_NAME_HEADER } from "../../../shared/boardCliAccess";
import type { Board } from "../../../shared/models";
import { setRuntimeCliClientName } from "../client/clientIdentity";
import { createDefaultCliContext } from "../../handlers/context";
import { captureStdout } from "../core/testHelpers";
import { CLI_ERR } from "../../types/errors";
import {
  resetCliOutputFormat,
  syncCliOutputFormatFromGlobals,
} from "../output/output";
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
  runReleasesSetDefault,
  runReleasesUpdate,
  runTasksAdd,
  runTasksDelete,
  runTasksMove,
  runTasksUpdate,
} from "./writeCommands";

const ctx = createDefaultCliContext();

function reqUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : (input as Request).url;
}

describe("writeCommands breadth — validation", () => {
  test("runListsAdd throws without --board", async () => {
    await expect(runListsAdd(ctx, { port: 1, board: undefined })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runListsList throws without --board", async () => {
    await expect(runListsList(ctx, { port: 1, board: undefined })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runTasksAdd throws without --list / --group", async () => {
    await expect(
      runTasksAdd(ctx, { port: 1, board: "b", list: undefined, group: "1" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
    await expect(
      runTasksAdd(ctx, { port: 1, board: "b", list: "1", group: undefined }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runBoardsUpdate throws without board id", async () => {
    await expect(runBoardsUpdate(ctx, { port: 1, board: undefined })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runBoardsUpdate throws when no update fields", async () => {
    await expect(runBoardsUpdate(ctx, { port: 1, board: "b" })).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.noUpdateFields }),
    });
  });

  test("runListsUpdate throws without patch fields", async () => {
    await expect(
      runListsUpdate(ctx, { port: 1, board: "b", listId: "1" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.noUpdateFields }),
    });
  });

  test("runTasksUpdate throws without patch fields", async () => {
    await expect(
      runTasksUpdate(ctx, { port: 1, board: "b", taskId: "9" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.noUpdateFields }),
    });
  });

  test("runReleasesAdd throws without name", async () => {
    await expect(
      runReleasesAdd(ctx, { port: 1, board: "b", name: "" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runReleasesUpdate throws without patch fields", async () => {
    await expect(
      runReleasesUpdate(ctx, { port: 1, board: "b", releaseId: "1" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.noUpdateFields }),
    });
  });

  test("runReleasesSetDefault throws without board", async () => {
    await expect(
      runReleasesSetDefault(ctx, {
        port: 1,
        board: undefined,
        releaseId: "1",
        clear: false,
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runReleasesSetDefault throws without release id and without --clear", async () => {
    await expect(
      runReleasesSetDefault(ctx, {
        port: 1,
        board: "b",
        releaseId: undefined,
        clear: false,
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runReleasesSetDefault throws when release id and --clear together", async () => {
    await expect(
      runReleasesSetDefault(ctx, {
        port: 1,
        board: "b",
        releaseId: "2",
        clear: true,
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.mutuallyExclusiveOptions }),
    });
  });

  test("runListsMove throws on multiple placement flags", async () => {
    await expect(
      runListsMove(ctx, {
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
      runTasksMove(ctx, { port: 1, board: "b", taskId: "1" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("runTasksMove throws on multiple placement flags", async () => {
    await expect(
      runTasksMove(ctx, {
        port: 1,
        board: "b",
        taskId: "1",
        toList: "2",
        first: true,
        last: true,
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.mutuallyExclusiveOptions }),
    });
  });

  test("runBoardsUpdate throws when --clear-description conflicts with description", async () => {
    await expect(
      runBoardsUpdate(ctx, {
        port: 1,
        board: "b",
        clearDescription: true,
        description: "x",
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.conflictingClearWithInput }),
    });
  });

  test("runBoardsGroups throws on invalid task groups JSON", async () => {
    await expect(
      runBoardsGroups(ctx, { port: 1, board: "b", json: "{not-json" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.invalidJson }),
    });
  });

  test("runTasksAdd throws on conflicting body inputs", async () => {
    await expect(
      runTasksAdd(ctx, {
        port: 1,
        board: "b",
        list: "1",
        group: "1",
        body: "a",
        bodyFile: "/nope/does-not-matter",
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.conflictingInputSources }),
    });
  });

  test("runReleasesDelete throws on invalid move-tasks-to id", async () => {
    await expect(
      runReleasesDelete(ctx, {
        port: 1,
        board: "b",
        releaseId: "1",
        moveTasksTo: "0",
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
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
    resetCliOutputFormat();
    setRuntimeCliClientName("");
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
      runListsList(ctx, { port: 22009, board: "lb" }),
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
      runListsAdd(ctx, { port: 22010, board: "my", name: "Backlog" }),
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
      runListsUpdate(ctx, {
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
      runListsDelete(ctx, { port: 22012, board: "b1", listId: "3" }),
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
      runListsMove(ctx, {
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
      runTasksAdd(ctx, {
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
      runTasksUpdate(ctx, {
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
      runTasksDelete(ctx, { port: 22016, board: "brd", taskId: "8" }),
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
      runTasksMove(ctx, {
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
      runBoardsUpdate(ctx, { port: 22018, board: "x", name: "Patched" }),
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
      // api-client uses explicit GET for reads (not fetch default omitting method).
      if (
        url.includes("/boards/del") &&
        (!init?.method || init.method === "GET")
      ) {
        phase += 1;
        return new Response(JSON.stringify(board), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("nope", { status: 404 });
    });
    const out = await captureStdout(() =>
      runBoardsDelete(ctx, { port: 22019, board: "del" }),
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
      runBoardsGroups(ctx, { port: 22020, board: "g", json: payload }),
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
      runBoardsPriorities(ctx, { port: 22021, board: "p", json: "[]" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runReleasesAdd POSTs release", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b/releases");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "b",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: {
            releaseId: 3,
            name: "1.0",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runReleasesAdd(ctx, { port: 22022, board: "b", name: "1.0" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({
      ok: true,
      boardId: 1,
      boardSlug: "b",
      entity: { type: "release", releaseId: 3, name: "1.0" },
    });
  });

  test("runReleasesUpdate PATCHes release", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b/releases/3");
      expect(init?.method).toBe("PATCH");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "b",
          boardUpdatedAt: "2026-01-03T00:00:00.000Z",
          entity: {
            releaseId: 3,
            name: "1.1",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runReleasesUpdate(ctx, { port: 22023, board: "b", releaseId: "3", name: "1.1" }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({
      ok: true,
      entity: { type: "release", name: "1.1" },
    });
  });

  test("runReleasesDelete returns writeSuccess-style envelope", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b/releases/2");
      expect(init?.method).toBe("DELETE");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "b",
          boardUpdatedAt: "2026-01-04T00:00:00.000Z",
          deletedReleaseId: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runReleasesDelete(ctx, { port: 22024, board: "b", releaseId: "2" }),
    );
    expect(JSON.parse(out.trim())).toEqual({
      ok: true,
      boardId: 1,
      boardSlug: "b",
      boardUpdatedAt: "2026-01-04T00:00:00.000Z",
      entity: { type: "release", releaseId: 2, deleted: true },
    });
  });

  test("runReleasesSetDefault GETs releases then PATCHes board defaultReleaseId", async () => {
    setMockFetch(async (input, init) => {
      const u = reqUrl(input);
      if (
        u.includes("/boards/b/releases") &&
        (init?.method === "GET" || init?.method === undefined)
      ) {
        return new Response(
          JSON.stringify({
            items: [
              {
                releaseId: 2,
                name: "v1",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            total: 1,
            limit: 500,
            offset: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (u.includes("/api/boards/b") && !u.includes("/releases") && init?.method === "PATCH") {
        expect(JSON.parse(String(init?.body))).toEqual({ defaultReleaseId: 2 });
        return new Response(
          JSON.stringify({
            boardId: 1,
            slug: "b",
            name: "B",
            emoji: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            defaultReleaseId: 2,
            releases: [],
            lists: [],
            taskGroups: [],
            taskPriorities: [],
            defaultTaskGroupId: 1,
            autoAssignReleaseOnCreateUi: false,
            autoAssignReleaseOnCreateCli: false,
          } as unknown as Board),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${u} ${init?.method}`);
    });
    const out = await captureStdout(() =>
      runReleasesSetDefault(ctx, {
        port: 22025,
        board: "b",
        releaseId: "2",
        clear: false,
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({
      ok: true,
      entity: { type: "board", defaultReleaseId: 2 },
    });
  });

  test("runReleasesSetDefault --clear PATCHes defaultReleaseId null", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/b");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ defaultReleaseId: null });
      return new Response(
        JSON.stringify({
          boardId: 1,
          slug: "b",
          name: "B",
          emoji: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          defaultReleaseId: null,
          releases: [],
          lists: [],
          taskGroups: [],
          taskPriorities: [],
          defaultTaskGroupId: 1,
          autoAssignReleaseOnCreateUi: false,
          autoAssignReleaseOnCreateCli: false,
        } as unknown as Board),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runReleasesSetDefault(ctx, {
        port: 22026,
        board: "b",
        releaseId: undefined,
        clear: true,
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({
      ok: true,
      entity: { type: "board", defaultReleaseId: null },
    });
  });

  test("mutating fetch sends runtime client name header", async () => {
    setRuntimeCliClientName("Cursor Agent");
    setMockFetch(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get(TASK_MANAGER_CLIENT_NAME_HEADER)).toBe("Cursor Agent");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "brd",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: {
            taskId: 1,
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
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      runTasksAdd(ctx, {
        port: 22025,
        board: "brd",
        list: "1",
        group: "1",
        title: "T",
      }),
    );
  });

  test("runBoardsUpdate prints human-formatted success", async () => {
    syncCliOutputFormatFromGlobals({ format: "human" });
    const board = jsonBoard({
      boardId: 1,
      slug: "hum",
      name: "Human Board",
    });
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/hum");
      expect(init?.method).toBe("PATCH");
      const body = JSON.parse(String(init?.body));
      expect(body.emoji).toBeNull();
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await captureStdout(() =>
      runBoardsUpdate(ctx, {
        port: 22026,
        board: "hum",
        clearEmoji: true,
      }),
    );
    expect(out).toContain("ok:");
    expect(out).toContain("true");
  });

  test("runBoardsDelete prints human trash envelope", async () => {
    syncCliOutputFormatFromGlobals({ format: "human" });
    const board = jsonBoard({ boardId: 1, slug: "delh", name: "D" });
    setMockFetch(async (input, init) => {
      const url = reqUrl(input);
      if (url.includes("/boards/delh") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/boards/delh") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify(board), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("nope", { status: 404 });
    });
    const out = await captureStdout(() =>
      runBoardsDelete(ctx, { port: 22027, board: "delh" }),
    );
    expect(out).toContain("trashed");
  });

  test("runBoardsGroups loads JSON from --file", async () => {
    const board = jsonBoard({ boardId: 1, slug: "gf", name: "G" });
    const payload = JSON.stringify({
      creates: [],
      updates: [],
      deletes: [],
      defaultTaskGroupId: 1,
      deletedGroupFallbackId: 1,
    });
    const dir = mkdtempSync(join(tmpdir(), "hirotm-groups-"));
    const filePath = join(dir, "groups.json");
    writeFileSync(filePath, payload, "utf8");
    try {
      setMockFetch(async (input, init) => {
        expect(reqUrl(input)).toContain("/api/boards/gf/groups");
        expect(init?.method).toBe("PATCH");
        return new Response(JSON.stringify(board), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
      const out = await captureStdout(() =>
        runBoardsGroups(ctx, { port: 22028, board: "gf", file: filePath }),
      );
      expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("runBoardsPriorities PATCH sends non-empty taskPriorities", async () => {
    const board = jsonBoard({ boardId: 1, slug: "pr", name: "P" });
    const prioritiesJson = JSON.stringify([
      { priorityId: 1, value: 0, label: "none", color: "", isSystem: true },
    ]);
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/pr/priorities");
      const body = JSON.parse(String(init?.body));
      expect(body.taskPriorities).toHaveLength(1);
      expect(body.taskPriorities[0].label).toBe("none");
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await captureStdout(() =>
      runBoardsPriorities(ctx, { port: 22029, board: "pr", json: prioritiesJson }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runListsAdd POST includes emoji in body", async () => {
    setMockFetch(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        name: "Lane",
        emoji: "✅",
      });
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "lb",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: { listId: 8, name: "Lane", order: 0, emoji: "✅" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runListsAdd(ctx, {
        port: 22030,
        board: "lb",
        name: "Lane",
        emoji: "✅",
      }),
    );
    expect(JSON.parse(out.trim())).toMatchObject({ ok: true });
  });

  test("runListsMove PUT uses last placement", async () => {
    const board = jsonBoard({
      boardId: 1,
      slug: "lm",
      name: "B",
      lists: [
        { listId: 5, name: "L", order: 0, emoji: null },
        { listId: 6, name: "L2", order: 1, emoji: null },
      ],
    });
    setMockFetch(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.listId).toBe(5);
      expect(body.position).toBe("last");
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await captureStdout(() =>
      runListsMove(ctx, {
        port: 22031,
        board: "lm",
        listId: "5",
        last: true,
      }),
    );
  });

  test("runListsMove PUT uses beforeListId / afterListId", async () => {
    const board = jsonBoard({
      boardId: 1,
      slug: "lm2",
      name: "B",
      lists: [{ listId: 5, name: "L", order: 0, emoji: null }],
    });
    let calls = 0;
    setMockFetch(async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body));
      if (calls === 1) {
        expect(body.beforeListId).toBe(9);
        expect(body.afterListId).toBeUndefined();
      } else {
        expect(body.afterListId).toBe(8);
        expect(body.beforeListId).toBeUndefined();
      }
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await captureStdout(() =>
      runListsMove(ctx, {
        port: 22032,
        board: "lm2",
        listId: "5",
        before: "9",
      }),
    );
    await captureStdout(() =>
      runListsMove(ctx, {
        port: 22032,
        board: "lm2",
        listId: "5",
        after: "8",
      }),
    );
    expect(calls).toBe(2);
  });

  test("runTasksAdd POST includes priorityId and releaseId", async () => {
    setMockFetch(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.priorityId).toBe(3);
      expect(body.releaseId).toBe(7);
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "brd",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: {
            taskId: 1,
            listId: 1,
            groupId: 1,
            title: "T",
            body: "",
            priorityId: 3,
            status: "open",
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      runTasksAdd(ctx, {
        port: 22033,
        board: "brd",
        list: "1",
        group: "1",
        title: "T",
        priority: "3",
        releaseId: "7",
      }),
    );
  });

  test("runTasksAdd resolves release name via GET board then POSTs task", async () => {
    let getBoard = 0;
    setMockFetch(async (input, init) => {
      const url = reqUrl(input);
      if (url.includes("/api/boards/brn") && !url.includes("/tasks")) {
        getBoard += 1;
        expect(!init?.method || init.method === "GET").toBe(true);
        return new Response(
          JSON.stringify(
            jsonBoard({
              boardId: 1,
              slug: "brn",
              name: "B",
              releases: [
                {
                  releaseId: 5,
                  name: "v1",
                  createdAt: "2026-01-01T00:00:00.000Z",
                },
              ],
            }),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/tasks") && init?.method === "POST") {
        const body = JSON.parse(String(init?.body));
        expect(body.releaseId).toBe(5);
        return new Response(
          JSON.stringify({
            boardId: 1,
            boardSlug: "brn",
            boardUpdatedAt: "2026-01-02T00:00:00.000Z",
            entity: {
              taskId: 2,
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
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    await captureStdout(() =>
      runTasksAdd(ctx, {
        port: 22034,
        board: "brn",
        list: "1",
        group: "1",
        title: "T",
        release: "v1",
      }),
    );
    expect(getBoard).toBeGreaterThanOrEqual(1);
  });

  test("runTasksAdd reads body from --body-file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hirotm-task-body-"));
    const filePath = join(dir, "body.md");
    writeFileSync(filePath, "File body\n", "utf8");
    try {
      setMockFetch(async (_input, init) => {
        expect(JSON.parse(String(init?.body)).body).toBe("File body\n");
        return new Response(
          JSON.stringify({
            boardId: 1,
            boardSlug: "brd",
            boardUpdatedAt: "2026-01-02T00:00:00.000Z",
            entity: {
              taskId: 3,
              listId: 1,
              groupId: 1,
              title: "T",
              body: "File body\n",
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
      await captureStdout(() =>
        runTasksAdd(ctx, {
          port: 22035,
          board: "brd",
          list: "1",
          group: "1",
          title: "T",
          bodyFile: filePath,
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("runTasksUpdate PATCHes status, priorityId, releaseId", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("/api/boards/brd/tasks/9");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        status: "closed",
        priorityId: 2,
        releaseId: 4,
      });
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "brd",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: {
            taskId: 9,
            listId: 1,
            groupId: 1,
            title: "T",
            body: "",
            priorityId: 2,
            status: "closed",
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      runTasksUpdate(ctx, {
        port: 22036,
        board: "brd",
        taskId: "9",
        status: "closed",
        priority: "2",
        releaseId: "4",
      }),
    );
  });

  test("runTasksMove PUT sends placement and toStatus", async () => {
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
    setMockFetch(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.taskId).toBe(7);
      expect(body.toListId).toBe(2);
      expect(body.toStatus).toBe("in-progress");
      expect(body.position).toBe("last");
      expect(body.beforeTaskId).toBeUndefined();
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await captureStdout(() =>
      runTasksMove(ctx, {
        port: 22037,
        board: "brd",
        taskId: "7",
        toList: "2",
        toStatus: "in-progress",
        last: true,
      }),
    );
  });

  test("runTasksMove PUT sends beforeTaskId and afterTaskId", async () => {
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
    let n = 0;
    setMockFetch(async (_input, init) => {
      n += 1;
      const body = JSON.parse(String(init?.body));
      if (n === 1) {
        expect(body.beforeTaskId).toBe(10);
      } else {
        expect(body.afterTaskId).toBe(11);
      }
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await captureStdout(() =>
      runTasksMove(ctx, {
        port: 22038,
        board: "brd",
        taskId: "7",
        toList: "2",
        beforeTask: "10",
      }),
    );
    await captureStdout(() =>
      runTasksMove(ctx, {
        port: 22038,
        board: "brd",
        taskId: "7",
        toList: "2",
        afterTask: "11",
      }),
    );
    expect(n).toBe(2);
  });

  test("runReleasesAdd POST includes color and releaseDate", async () => {
    setMockFetch(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        name: "2.0",
        color: "#abc",
        releaseDate: "2026-06-01",
      });
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "b",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: {
            releaseId: 9,
            name: "2.0",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      runReleasesAdd(ctx, {
        port: 22039,
        board: "b",
        name: "2.0",
        color: "#abc",
        releaseDate: "2026-06-01",
      }),
    );
  });

  test("runReleasesUpdate PATCH clears color", async () => {
    setMockFetch(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ color: null });
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "b",
          boardUpdatedAt: "2026-01-03T00:00:00.000Z",
          entity: {
            releaseId: 3,
            name: "1.1",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      runReleasesUpdate(ctx, {
        port: 22040,
        board: "b",
        releaseId: "3",
        clearColor: true,
      }),
    );
  });

  test("runReleasesDelete DELETE appends moveTasksTo query", async () => {
    setMockFetch(async (input, init) => {
      expect(reqUrl(input)).toContain("moveTasksTo=8");
      expect(init?.method).toBe("DELETE");
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "b",
          boardUpdatedAt: "2026-01-04T00:00:00.000Z",
          deletedReleaseId: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      runReleasesDelete(ctx, {
        port: 22041,
        board: "b",
        releaseId: "2",
        moveTasksTo: "8",
      }),
    );
  });
});
