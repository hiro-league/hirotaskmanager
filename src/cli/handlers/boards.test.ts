import { afterEach, describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import type { BoardIndexEntry, Task } from "../../shared/models";
import { RELEASE_FILTER_UNTAGGED } from "../../shared/boardFilters";
import { syncCliOutputFormatFromGlobals } from "../lib/cliFormat";
import { createTestCliRuntime } from "../lib/runtime";
import { resetCliOutputFormat } from "../lib/output";
import { createDefaultCliContext } from "./context";
import type { BoardDescribeResponse } from "../../shared/boardDescribe";
import {
  handleBoardsDescribe,
  handleBoardsList,
  handleBoardsTasks,
} from "./boards";
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
    printJson: () => {},
    getRuntime: () => createTestCliRuntime({ port: 3002 }),
    ...overrides,
  };
}

describe("handleBoardsList (CliContext)", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("uses injected fetchApi and prints NDJSON lines to stdout", async () => {
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
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    let out = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      out +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      void args;
      return true;
    };
    try {
      await handleBoardsList(ctx, {});
    } finally {
      process.stdout.write = origWrite;
    }

    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual(sample[0]);
  });

  test("with global --quiet prints slug per line (not JSON)", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
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
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    let out = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      out +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      void args;
      return true;
    };
    try {
      await handleBoardsList(ctx, {});
    } finally {
      process.stdout.write = origWrite;
    }

    expect(out.trimEnd()).toBe("alpha");
  });
});

describe("handleBoardsDescribe", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("fetches describe; ndjson prints kind board line to stdout", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const sample: BoardDescribeResponse = {
      board: {
        boardId: 1,
        slug: "b",
        name: "B",
        description: "",
        cliPolicy: {
          readBoard: true,
          createTasks: false,
          manageCliCreatedTasks: false,
          manageAnyTasks: false,
          createLists: false,
          manageCliCreatedLists: false,
          manageAnyLists: false,
          manageStructure: false,
          deleteBoard: false,
          editBoard: false,
        },
      },
    };
    let path = "";
    const ctx = mockContext({
      fetchApi: (async (p) => {
        path = p;
        return sample;
      }) as CliContext["fetchApi"],
    });

    let out = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      out +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      void args;
      return true;
    };
    try {
      await handleBoardsDescribe(ctx, "my-slug", {});

      expect(path).toBe("/boards/my-slug/describe");
      const lines = out.trimEnd().split("\n");
      const row0 = JSON.parse(lines[0]!) as { kind: string; boardId: number };
      expect(row0.kind).toBe("board");
      expect(row0.boardId).toBe(1);
      expect(JSON.parse(lines[1]!).kind).toBe("policy");

      out = "";
      await handleBoardsDescribe(ctx, "x", { entities: "list,group" });
      expect(path).toBe("/boards/x/describe?entities=group%2Clist");
      const lines2 = out.trim().split("\n");
      expect(JSON.parse(lines2[0]!).kind).toBe("board");
      expect(JSON.parse(lines2[1]!).kind).toBe("policy");
    } finally {
      process.stdout.write = origWrite;
    }
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
