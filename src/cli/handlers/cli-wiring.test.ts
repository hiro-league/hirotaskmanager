/**
 * Thin handlers delegate to writeCommands/trashCommands with resolved port.
 * Ensures `resolvePort` wiring matches real CLI usage.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createTestCliRuntime } from "../lib/runtime";
import { captureStdout } from "../lib/testHelpers";
import { createDefaultCliContext } from "./context";
import { handleBoardsUpdate } from "./boards";
import type { CliContext } from "./context";
import { handleListsAdd, handleListsList } from "./lists";
import { handleReleasesAdd } from "./releases";
import { handleTasksAdd } from "./tasks";
import { handleTrashLists } from "./trash";

function reqUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : (input as Request).url;
}

/** Deterministic port for fetch URL assertions (injected `resolvePort`; not parsing argv here). */
function wiringContext(): CliContext {
  return {
    ...createDefaultCliContext(),
    resolvePort: () => 31999,
    getRuntime: () => createTestCliRuntime({ port: 31999 }),
  };
}

describe("CLI handler → writeCommands wiring", () => {
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

  test("handleListsAdd uses resolved port from context", async () => {
    let sawPort = "";
    setMockFetch(async (input) => {
      sawPort = new URL(reqUrl(input)).port;
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "wb",
          boardUpdatedAt: "2026-01-01T00:00:00.000Z",
          entity: { id: 1, name: "L", order: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      handleListsAdd(wiringContext(), "L", {
        board: "wb",
      }),
    );
    expect(sawPort).toBe("31999");
  });

  test("handleListsList uses resolved port from context", async () => {
    let sawPort = "";
    setMockFetch(async (input) => {
      sawPort = new URL(reqUrl(input)).port;
      return new Response(
        JSON.stringify({
          items: [],
          total: 0,
          limit: 0,
          offset: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      handleListsList(wiringContext(), {
        board: "wb",
      }),
    );
    expect(sawPort).toBe("31999");
  });

  test("handleTasksAdd uses resolved port from context", async () => {
    let sawPort = "";
    setMockFetch(async (input) => {
      sawPort = new URL(reqUrl(input)).port;
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "tb",
          boardUpdatedAt: "2026-01-01T00:00:00.000Z",
          entity: {
            id: 1,
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
      handleTasksAdd(wiringContext(), {
        board: "tb",
        list: "1",
        group: "1",
        title: "T",
      }),
    );
    expect(sawPort).toBe("31999");
  });

  test("handleReleasesAdd uses resolved port from context", async () => {
    let sawPort = "";
    setMockFetch(async (input) => {
      sawPort = new URL(reqUrl(input)).port;
      return new Response(
        JSON.stringify({
          boardId: 1,
          boardSlug: "rb",
          boardUpdatedAt: "2026-01-02T00:00:00.000Z",
          entity: {
            releaseId: 1,
            name: "R",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      handleReleasesAdd(wiringContext(), {
        board: "rb",
        name: "R",
      }),
    );
    expect(sawPort).toBe("31999");
  });

  test("handleBoardsUpdate uses resolved port from context", async () => {
    let sawPort = "";
    setMockFetch(async (input) => {
      sawPort = new URL(reqUrl(input)).port;
      return new Response(
        JSON.stringify({
          id: 1,
          slug: "bu",
          name: "BU",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          description: "",
          lists: [],
          tasks: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      handleBoardsUpdate(wiringContext(), "bu", {
        name: "BU",
      }),
    );
    expect(sawPort).toBe("31999");
  });

  test("handleTrashLists uses resolved port from context", async () => {
    let sawPort = "";
    setMockFetch(async (input) => {
      sawPort = new URL(reqUrl(input)).port;
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
    });
    await captureStdout(() =>
      handleTrashLists(wiringContext(), {}),
    );
    expect(sawPort).toBe("31999");
  });
});
