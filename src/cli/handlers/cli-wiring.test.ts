/**
 * Thin handlers delegate to writeCommands/trashCommands with resolved port.
 * Ensures `parsePortOption` + `resolvePort` wiring matches real CLI usage.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { ConfigOverrides } from "../lib/config";
import { handleBoardsUpdate } from "./boards";
import type { CliContext } from "./context";
import { handleListsAdd, handleListsList } from "./lists";
import { handleReleasesAdd } from "./releases";
import { handleTasksAdd } from "./tasks";
import { handleTrashLists } from "./trash";

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

/** `resolvePort` must honor `-p` / `--port` like createDefaultCliContext. */
function wiringContext(): CliContext {
  return {
    resolvePort: (o?: ConfigOverrides) =>
      typeof o?.port === "number" ? o.port : 31999,
    resolveDataDir: () => "/tmp",
    fetchApi: async () => {
      throw new Error("fetchApi unused in wiring tests");
    },
    printJson: () => {},
    startServer: async () => {
      throw new Error("unused");
    },
    stopServer: async () => {
      throw new Error("unused");
    },
    readServerStatus: async () => ({ running: false }),
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

  test("handleListsAdd uses port from options", async () => {
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
        port: "22301",
      }),
    );
    expect(sawPort).toBe("22301");
  });

  test("handleListsList uses port from options", async () => {
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
        port: "22306",
      }),
    );
    expect(sawPort).toBe("22306");
  });

  test("handleTasksAdd uses port from options", async () => {
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
        port: "22302",
      }),
    );
    expect(sawPort).toBe("22302");
  });

  test("handleReleasesAdd uses port from options", async () => {
    let sawPort = "";
    setMockFetch(async (input) => {
      sawPort = new URL(reqUrl(input)).port;
      return new Response(
        JSON.stringify({ id: 1, name: "R", createdAt: "2026-01-01T00:00:00.000Z" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await captureStdout(() =>
      handleReleasesAdd(wiringContext(), {
        board: "rb",
        name: "R",
        port: "22303",
      }),
    );
    expect(sawPort).toBe("22303");
  });

  test("handleBoardsUpdate uses port from options", async () => {
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
        port: "22304",
      }),
    );
    expect(sawPort).toBe("22304");
  });

  test("handleTrashLists uses port from options", async () => {
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
      handleTrashLists(wiringContext(), { port: "22305" }),
    );
    expect(sawPort).toBe("22305");
  });
});
