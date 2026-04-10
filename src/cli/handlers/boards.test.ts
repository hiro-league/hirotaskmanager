import { describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import type { Board, BoardIndexEntry, Task } from "../../shared/models";
import { RELEASE_FILTER_UNTAGGED } from "../../shared/boardFilters";
import {
  handleBoardsList,
  handleBoardsShow,
  handleBoardsTasks,
} from "./boards";
import type { CliContext } from "./context";

function mockContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    resolvePort: () => 3002,
    resolveDataDir: () => "/tmp",
    fetchApi: async () => {
      throw new Error("fetchApi not stubbed");
    },
    printJson: () => {},
    printSearchTable: () => {},
    startServer: async () => {
      throw new Error("unused");
    },
    stopServer: async () => {
      throw new Error("unused");
    },
    readServerStatus: async () => ({ running: false }),
    ...overrides,
  };
}

describe("handleBoardsList (CliContext)", () => {
  test("uses injected fetchApi and printJson", async () => {
    const sample: BoardIndexEntry[] = [
      {
        boardId: 1,
        slug: "alpha",
        name: "Alpha",
        emoji: null,
        description: "",
        cliPolicy: {
          readBoard: true,
          createTasks: true,
          manageCliCreatedTasks: true,
          manageAnyTasks: false,
          createLists: true,
          manageCliCreatedLists: true,
          manageAnyLists: false,
          manageStructure: false,
          deleteBoard: false,
          editBoard: false,
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const envelope: PaginatedListBody<BoardIndexEntry> = {
      items: sample,
      total: sample.length,
      limit: sample.length,
      offset: 0,
    };
    let printed: unknown;
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
      printJson: (data: unknown) => {
        printed = data;
      },
    });

    await handleBoardsList(ctx, {});

    expect(printed).toEqual(envelope);
  });
});

describe("handleBoardsShow", () => {
  test("fetches board by slug and prints JSON", async () => {
    const board = { boardId: 1, name: "B", slug: "b" } as unknown as Board;
    let path = "";
    let printed: unknown;
    const ctx = mockContext({
      fetchApi: (async (p) => {
        path = p;
        return board;
      }) as CliContext["fetchApi"],
      printJson: (d) => {
        printed = d;
      },
    });

    await handleBoardsShow(ctx, "my-slug", {});

    expect(path).toBe("/boards/my-slug");
    expect(printed).toBe(board);
  });
});

describe("handleBoardsTasks", () => {
  test("builds query string for filters", async () => {
    const envelope: PaginatedListBody<Task> = {
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    };
    let path = "";
    const ctx = mockContext({
      fetchApi: (async (p) => {
        path = p;
        return envelope;
      }) as CliContext["fetchApi"],
      printJson: () => {},
    });

    await handleBoardsTasks(ctx, "brd", {
      list: "5",
      group: ["1", "2"],
      priority: ["10"],
      status: ["open"],
      releaseId: ["7"],
      untagged: true,
      dateMode: "updated",
      from: "2026-01-01",
      to: "2026-02-01",
    });

    expect(path).toContain("/boards/brd/tasks?");
    expect(path).toContain("listId=5");
    expect(path).toContain("groupId=1");
    expect(path).toContain("groupId=2");
    expect(path).toContain("priorityId=10");
    expect(path).toContain("status=open");
    expect(path).toContain("releaseId=7");
    expect(path).toContain(`releaseId=${encodeURIComponent(RELEASE_FILTER_UNTAGGED)}`);
    expect(path).toContain("dateMode=updated");
    expect(path).toContain("from=2026-01-01");
    expect(path).toContain("to=2026-02-01");
  });
});
