import { afterEach, describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import type { BoardIndexEntry, Task } from "../../shared/models";
import { RELEASE_FILTER_UNTAGGED } from "../../shared/boardFilters";
import type { BoardDescribeResponse } from "../../shared/boardDescribe";
import { CLI_DEFAULTS } from "../lib/core/constants";
import { syncCliOutputFormatFromGlobals } from "../lib/output/cliFormat";
import { createTestCliRuntime } from "../lib/core/runtime";
import { resetCliOutputFormat, CliError } from "../lib/output/output";
import { captureStdout } from "../lib/core/testHelpers";
import { createDefaultCliContext } from "./context";
import { CLI_ERR } from "../types/errors";
import {
  handleBoardsDescribe,
  handleBoardsList,
  handleBoardsTasks,
} from "./boards";
import type { CliContext } from "./context";

const defaultCliPolicy: BoardIndexEntry["cliPolicy"] = {
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
};

function boardEntry(overrides: Partial<BoardIndexEntry> = {}): BoardIndexEntry {
  return {
    boardId: 1,
    slug: "alpha",
    name: "Alpha",
    emoji: null,
    description: "",
    cliPolicy: defaultCliPolicy,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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
    const sample: BoardIndexEntry[] = [boardEntry()];
    const envelope: PaginatedListBody<BoardIndexEntry> = {
      items: sample,
      total: sample.length,
      limit: sample.length,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleBoardsList(ctx, {}));

    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual(sample[0]);
  });

  test("with global --quiet prints slug per line (not JSON)", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const sample: BoardIndexEntry[] = [boardEntry()];
    const envelope: PaginatedListBody<BoardIndexEntry> = {
      items: sample,
      total: sample.length,
      limit: sample.length,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleBoardsList(ctx, {}));

    expect(out.trimEnd()).toBe("alpha");
  });

  test("--format human — table headers and footer", async () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const sample: BoardIndexEntry[] = [boardEntry({ boardId: 9, slug: "s", name: "N" })];
    const envelope: PaginatedListBody<BoardIndexEntry> = {
      items: sample,
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleBoardsList(ctx, {}));

    expect(out).toContain("Slug");
    expect(out).toContain("Id");
    expect(out).toContain("N");
    expect(out).toContain("total 1");
  });

  test("--fields boardId,name — projected NDJSON lines", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const sample: BoardIndexEntry[] = [boardEntry()];
    const envelope: PaginatedListBody<BoardIndexEntry> = {
      items: sample,
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleBoardsList(ctx, { fields: "boardId,name" }),
    );

    const row = JSON.parse(out.trim().split("\n")[0]!) as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["boardId", "name"]);
  });

  test("--fields slug with --quiet — one value per line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const sample: BoardIndexEntry[] = [boardEntry()];
    const envelope: PaginatedListBody<BoardIndexEntry> = {
      items: sample,
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleBoardsList(ctx, { fields: "slug" }),
    );

    expect(out.trimEnd()).toBe("alpha");
  });

  test("--page-all merges two pages", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    let call = 0;
    const ctx = mockContext({
      fetchApi: (async (path: string) => {
        if (call++ === 0) {
          expect(path).toContain(`limit=${CLI_DEFAULTS.MAX_PAGE_LIMIT}`);
          expect(path).not.toContain("offset=");
          return {
            items: [boardEntry({ boardId: 1, slug: "a", name: "A" })],
            total: 2,
            limit: CLI_DEFAULTS.MAX_PAGE_LIMIT,
            offset: 0,
          } satisfies PaginatedListBody<BoardIndexEntry>;
        }
        expect(path).toContain(`offset=${CLI_DEFAULTS.MAX_PAGE_LIMIT}`);
        return {
          items: [boardEntry({ boardId: 2, slug: "b", name: "B" })],
          total: 2,
          limit: CLI_DEFAULTS.MAX_PAGE_LIMIT,
          offset: 0,
        } satisfies PaginatedListBody<BoardIndexEntry>;
      }) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleBoardsList(ctx, { pageAll: true }),
    );

    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
  });

  test("empty result — NDJSON no lines; human No rows.", async () => {
    const empty: PaginatedListBody<BoardIndexEntry> = {
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    };
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const ctxNd = mockContext({
      fetchApi: (async () => empty) as CliContext["fetchApi"],
    });
    const outNd = await captureStdout(() => handleBoardsList(ctxNd, {}));
    expect(outNd.trim()).toBe("");

    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const ctxHu = mockContext({
      fetchApi: (async () => empty) as CliContext["fetchApi"],
    });
    const outHu = await captureStdout(() => handleBoardsList(ctxHu, {}));
    expect(outHu).toContain("No rows.");
  });

  test("API 403 — CliError exit 4 forbidden", async () => {
    const ctx = mockContext({
      fetchApi: async () => {
        throw new CliError("denied", 4, { code: CLI_ERR.forbidden });
      },
    });
    await expect(handleBoardsList(ctx, {})).rejects.toMatchObject({
      exitCode: 4,
      details: expect.objectContaining({ code: CLI_ERR.forbidden }),
    });
  });

  test("API 401 — CliError exit 10 unauthenticated", async () => {
    const ctx = mockContext({
      fetchApi: async () => {
        throw new CliError("no", 10, { code: CLI_ERR.unauthenticated });
      },
    });
    await expect(handleBoardsList(ctx, {})).rejects.toMatchObject({
      exitCode: 10,
      details: expect.objectContaining({ code: CLI_ERR.unauthenticated }),
    });
  });
});

describe("handleBoardsDescribe", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  const minimalBoard: BoardDescribeResponse["board"] = {
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
  };

  test("fetches describe; ndjson prints kind board line to stdout", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const sample: BoardDescribeResponse = {
      board: minimalBoard,
    };
    let path = "";
    const ctx = mockContext({
      fetchApi: (async (p) => {
        path = p;
        return sample;
      }) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleBoardsDescribe(ctx, "my-slug", {}));

    expect(path).toBe("/boards/my-slug/describe");
    const lines = out.trimEnd().split("\n");
    const row0 = JSON.parse(lines[0]!) as { kind: string; boardId: number };
    expect(row0.kind).toBe("board");
    expect(row0.boardId).toBe(1);
    expect(JSON.parse(lines[1]!).kind).toBe("policy");

    const out2 = await captureStdout(() =>
      handleBoardsDescribe(ctx, "x", { entities: "list,group" }),
    );
    expect(path).toBe("/boards/x/describe?entities=group%2Clist");
    const lines2 = out2.trim().split("\n");
    expect(JSON.parse(lines2[0]!).kind).toBe("board");
    expect(JSON.parse(lines2[1]!).kind).toBe("policy");
  });

  test("entities meta — includes kind meta line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const meta = {
      lists: { truncated: false, total: 1, shown: 1 },
      groups: { truncated: false, total: 0, shown: 0 },
      priorities: { truncated: false, total: 0, shown: 0 },
      releases: { truncated: false, total: 0, shown: 0 },
      statuses: { truncated: false, total: 0, shown: 0 },
    };
    const sample: BoardDescribeResponse = {
      board: minimalBoard,
      meta,
    };
    const ctx = mockContext({
      fetchApi: (async () => sample) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleBoardsDescribe(ctx, "b", { entities: "meta" }),
    );

    const metaLine = out
      .trimEnd()
      .split("\n")
      .map((l) => JSON.parse(l) as { kind?: string })
      .find((r) => r.kind === "meta");
    expect(metaLine).toBeDefined();
    expect(metaLine).toMatchObject({ kind: "meta" });
  });

  test("entities all sections — row kinds in order", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const sample: BoardDescribeResponse = {
      board: minimalBoard,
      lists: { items: [{ listId: 1, name: "L" }] },
      groups: { items: [{ groupId: 1, label: "G", default: true }] },
      priorities: {
        items: [{ priorityId: 1, label: "P", value: 0 }],
      },
      releases: {
        items: [
          {
            releaseId: 1,
            name: "R",
            releaseDate: null,
            default: false,
          },
        ],
      },
      statuses: { items: [{ statusId: "open", label: "Open" }] },
      meta: {
        lists: { truncated: false, total: 1, shown: 1 },
        groups: { truncated: false, total: 1, shown: 1 },
        priorities: { truncated: false, total: 1, shown: 1 },
        releases: { truncated: false, total: 1, shown: 1 },
        statuses: { truncated: false, total: 1, shown: 1 },
      },
    };
    const ctx = mockContext({
      fetchApi: (async () => sample) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleBoardsDescribe(ctx, "b", {
        entities: "list,group,priority,release,status,meta",
      }),
    );

    const kinds = out
      .trimEnd()
      .split("\n")
      .map((l) => (JSON.parse(l) as { kind: string }).kind);
    expect(kinds).toEqual([
      "board",
      "policy",
      "list",
      "group",
      "priority",
      "release",
      "status",
      "meta",
    ]);
  });

  test("--format human — section titles and tables", async () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const sample: BoardDescribeResponse = {
      board: minimalBoard,
      lists: { items: [{ listId: 1, name: "Todo" }] },
    };
    const ctx = mockContext({
      fetchApi: (async () => sample) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleBoardsDescribe(ctx, "b", {}));

    expect(out).toContain("Board\n");
    expect(out).toContain("Lists\n");
    expect(out).toContain("Todo");
    expect(out).toContain("CLI policy\n");
  });

  test("--quiet — exit 2 (not supported for describe)", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const ctx = mockContext({
      fetchApi: (async () => ({ board: minimalBoard })) as CliContext["fetchApi"],
    });

    await expect(handleBoardsDescribe(ctx, "b", {})).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
    });
  });

  test("board not found — 404 maps to exit 3 not_found", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const ctx = mockContext({
      fetchApi: async () => {
        throw new CliError("missing", 3, { code: CLI_ERR.notFound });
      },
    });

    await expect(handleBoardsDescribe(ctx, "gone", {})).rejects.toMatchObject({
      exitCode: 3,
      details: expect.objectContaining({ code: CLI_ERR.notFound }),
    });
  });
});

describe("handleBoardsTasks", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

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

  test("repeated releaseId and group append params", async () => {
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
    });

    await handleBoardsTasks(ctx, "brd", {
      group: ["1", "2"],
      releaseId: ["7", "8"],
    });

    const u = new URL(path, "http://127.0.0.1");
    expect(u.searchParams.getAll("groupId")).toEqual(["1", "2"]);
    expect(u.searchParams.getAll("releaseId")).toEqual(["7", "8"]);
  });

  test("NDJSON prints one task JSON per line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const task: Task = {
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
    };
    const envelope: PaginatedListBody<Task> = {
      items: [task],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleBoardsTasks(ctx, "b", {}));

    expect(JSON.parse(out.trim().split("\n")[0]!)).toMatchObject({
      taskId: 1,
      title: "T",
    });
  });

  test("--format human — task table columns", async () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const task: Task = {
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
    };
    const envelope: PaginatedListBody<Task> = {
      items: [task],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleBoardsTasks(ctx, "b", {}));

    expect(out).toContain("Title");
    expect(out).toContain("Task");
    expect(out).toContain("total 1");
  });

  test("--quiet — taskId per line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const task: Task = {
      taskId: 42,
      listId: 1,
      groupId: 1,
      title: "T",
      body: "",
      priorityId: 1,
      status: "open",
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const envelope: PaginatedListBody<Task> = {
      items: [task],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleBoardsTasks(ctx, "b", {}));

    expect(out.trimEnd()).toBe("42");
  });

  test("--fields taskId,title — projected", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const task: Task = {
      taskId: 1,
      listId: 9,
      groupId: 1,
      title: "T",
      body: "x",
      priorityId: 1,
      status: "open",
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const envelope: PaginatedListBody<Task> = {
      items: [task],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleBoardsTasks(ctx, "b", { fields: "taskId,title" }),
    );

    const row = JSON.parse(out.trim()) as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["taskId", "title"]);
  });

  test("--page-all merges pages", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    let call = 0;
    const mkTask = (id: number): Task => ({
      taskId: id,
      listId: 1,
      groupId: 1,
      title: "T",
      body: "",
      priorityId: 1,
      status: "open",
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const ctx = mockContext({
      fetchApi: (async () => {
        if (call++ === 0) {
          return {
            items: [mkTask(1)],
            total: 2,
            limit: 2,
            offset: 0,
          } satisfies PaginatedListBody<Task>;
        }
        return {
          items: [mkTask(2)],
          total: 2,
          limit: 2,
          offset: 0,
        } satisfies PaginatedListBody<Task>;
      }) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleBoardsTasks(ctx, "b", { pageAll: true, limit: "2" }),
    );

    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
  });
});
