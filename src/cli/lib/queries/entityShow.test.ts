import { afterEach, describe, expect, test } from "bun:test";
import { createDefaultCliContext } from "../../handlers/context";
import { resetCliOutputFormat } from "../output/output";
import { captureStdout } from "../core/testHelpers";
import { runListsShow } from "./lists";
import { runTasksShow } from "./tasks";

const ctx = createDefaultCliContext();

describe("runTasksShow / runListsShow (mock fetch)", () => {
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

  test("runTasksShow GETs /api/tasks/:id and prints JSON", async () => {
    setMockFetch(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(url).toContain("/api/tasks/42");
      return new Response(
        JSON.stringify({
          taskId: 42,
          boardId: 7,
          boardSlug: "alpha",
          listId: 1,
          title: "T",
          body: "",
          groupId: 1,
          priorityId: 1,
          status: "open",
          order: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runTasksShow(ctx, "42", {}),
    );
    expect(JSON.parse(out.trim())).toMatchObject({
      taskId: 42,
      boardId: 7,
      boardSlug: "alpha",
      title: "T",
    });
  });

  test("runListsShow GETs /api/lists/:id and prints JSON", async () => {
    setMockFetch(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(url).toContain("/api/lists/7");
      return new Response(
        JSON.stringify({
          listId: 7,
          boardId: 3,
          boardSlug: "sprint",
          name: "Backlog",
          order: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await captureStdout(() =>
      runListsShow(ctx, "7", {}),
    );
    expect(JSON.parse(out.trim())).toMatchObject({
      listId: 7,
      boardId: 3,
      boardSlug: "sprint",
      name: "Backlog",
    });
  });
});
