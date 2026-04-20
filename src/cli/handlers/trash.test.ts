import { afterEach, describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import type {
  TrashedBoardItem,
  TrashedListItem,
  TrashedTaskItem,
} from "../../shared/trashApi";
import { syncCliOutputFormatFromGlobals } from "../lib/output/cliFormat";
import { createTestCliRuntime } from "../lib/core/runtime";
import { resetCliOutputFormat } from "../lib/output/output";
import { captureStdout } from "../lib/core/testHelpers";
import { createDefaultCliContext } from "./context";
import {
  handleTrashBoards,
  handleTrashLists,
  handleTrashTasks,
} from "./trash";
import type { CliContext } from "./context";

function mockContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    ...createDefaultCliContext(),
    resolvePort: () => 3002,
    fetchApi: async () => {
      throw new Error("fetchApi not stubbed");
    },
    fetchApiMutate: async () => {
      throw new Error("fetchApiMutate not stubbed");
    },
    fetchApiTrashMutate: async () => {
      throw new Error("fetchApiTrashMutate not stubbed");
    },
    getRuntime: () => createTestCliRuntime({ port: 3002 }),
    ...overrides,
  };
}

const boardItem: TrashedBoardItem = {
  type: "board",
  boardId: 1,
  name: "B",
  slug: "b",
  emoji: null,
  deletedAt: "2026-01-01T00:00:00.000Z",
  canRestore: true,
};

const listItem: TrashedListItem = {
  type: "list",
  listId: 2,
  name: "L",
  emoji: null,
  boardId: 1,
  boardName: "B",
  boardDeletedAt: null,
  deletedAt: "2026-01-01T00:00:00.000Z",
  canRestore: true,
};

const taskItem: TrashedTaskItem = {
  type: "task",
  taskId: 3,
  title: "T",
  emoji: null,
  boardId: 1,
  boardName: "B",
  boardDeletedAt: null,
  listId: 1,
  listName: "L",
  listDeletedAt: null,
  deletedAt: "2026-01-01T00:00:00.000Z",
  canRestore: true,
};

describe("trash list handlers", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("handleTrashBoards NDJSON", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const envelope: PaginatedListBody<TrashedBoardItem> = {
      items: [boardItem],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleTrashBoards(ctx, {}));

    expect(JSON.parse(out.trim()).boardId).toBe(1);
  });

  test("handleTrashBoards — human table", async () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const envelope: PaginatedListBody<TrashedBoardItem> = {
      items: [boardItem],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleTrashBoards(ctx, {}));

    expect(out).toContain("Slug");
    expect(out).toContain("B");
  });

  test("handleTrashBoards — quiet slug line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const envelope: PaginatedListBody<TrashedBoardItem> = {
      items: [boardItem],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleTrashBoards(ctx, {}));

    expect(out.trimEnd()).toBe("b");
  });

  test("handleTrashLists NDJSON + listId quiet", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const envelope: PaginatedListBody<TrashedListItem> = {
      items: [listItem],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const outNd = await captureStdout(() => handleTrashLists(ctx, {}));
    expect(JSON.parse(outNd.trim()).listId).toBe(2);

    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const outQ = await captureStdout(() => handleTrashLists(ctx, {}));
    expect(outQ.trimEnd()).toBe("2");
  });

  test("handleTrashTasks NDJSON + taskId quiet", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const envelope: PaginatedListBody<TrashedTaskItem> = {
      items: [taskItem],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const outNd = await captureStdout(() => handleTrashTasks(ctx, {}));
    expect(JSON.parse(outNd.trim()).taskId).toBe(3);

    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const outQ = await captureStdout(() => handleTrashTasks(ctx, {}));
    expect(outQ.trimEnd()).toBe("3");
  });

  test("empty trash boards — NDJSON empty; human contextual empty-trash message", async () => {
    const empty: PaginatedListBody<TrashedBoardItem> = {
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    };
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const ctx = mockContext({
      fetchApi: (async () => empty) as CliContext["fetchApi"],
    });
    const outNd = await captureStdout(() => handleTrashBoards(ctx, {}));
    expect(outNd.trim()).toBe("");

    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const outHu = await captureStdout(() => handleTrashBoards(ctx, {}));
    expect(outHu).toContain("Trash is empty (no boards).");
  });
});
