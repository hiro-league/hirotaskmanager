import { afterEach, describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import type { SearchHit } from "../../shared/models";
import { CLI_ERR } from "../types/errors";
import { syncCliOutputFormatFromGlobals } from "../lib/cliFormat";
import { createTestCliRuntime } from "../lib/runtime";
import { resetCliOutputFormat } from "../lib/output";
import { createDefaultCliContext } from "./context";
import { handleSearch } from "./search";
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

describe("handleSearch", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("requires non-empty query", async () => {
    const ctx = mockContext();
    await expect(handleSearch(ctx, ["", "  "], {})).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("ndjson output prints one JSON object per hit line", async () => {
    const hits: SearchHit[] = [
      {
        boardId: 1,
        boardSlug: "b",
        taskId: 9,
        boardName: "B",
        listId: 2,
        listName: "L",
        title: "T",
        snippet: "s",
        score: 0.1,
      },
    ];
    const body: PaginatedListBody<SearchHit> = {
      items: hits,
      total: hits.length,
      limit: 5,
      offset: 0,
    };
    let fetchedPath = "";
    const ctx = mockContext({
      fetchApi: (async (path) => {
        fetchedPath = path;
        return body;
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
      await handleSearch(ctx, ["hello", "world"], {
        board: "b1",
        limit: "5",
        noPrefix: true,
      });
    } finally {
      process.stdout.write = origWrite;
    }

    expect(fetchedPath).toContain("/search?");
    expect(fetchedPath).toContain("q=hello+world");
    expect(fetchedPath).toContain("limit=5");
    expect(fetchedPath).toContain("board=b1");
    expect(fetchedPath).toContain("prefix=0");
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual(hits[0]);
  });

  test("rejects --fields when global format is human", async () => {
    syncCliOutputFormatFromGlobals({ format: "human" });
    const ctx = mockContext();
    await expect(
      handleSearch(ctx, ["q"], { fields: "taskId" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
    });
  });

  test("ndjson --fields projects items", async () => {
    const hits: SearchHit[] = [
      {
        boardId: 1,
        boardSlug: "b",
        taskId: 9,
        boardName: "B",
        listId: 2,
        listName: "L",
        title: "T",
        snippet: "s",
        score: 0.1,
      },
    ];
    const body: PaginatedListBody<SearchHit> = {
      items: hits,
      total: 1,
      limit: 20,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => body) as CliContext["fetchApi"],
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
      await handleSearch(ctx, ["q"], { fields: "taskId,title" });
    } finally {
      process.stdout.write = origWrite;
    }

    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual({ taskId: 9, title: "T" });
  });

  test("human format prints a fixed-width table", async () => {
    syncCliOutputFormatFromGlobals({ format: "human" });
    const hits: SearchHit[] = [
      {
        boardId: 1,
        boardSlug: "b",
        taskId: 1,
        boardName: "B",
        listId: 2,
        listName: "L",
        title: "T",
        snippet: "s",
        score: 0.2,
      },
    ];
    const body: PaginatedListBody<SearchHit> = {
      items: hits,
      total: 1,
      limit: 20,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => body) as CliContext["fetchApi"],
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
      await handleSearch(ctx, ["q"], {});
    } finally {
      process.stdout.write = origWrite;
    }

    expect(out).toContain("Board");
    expect(out).toContain("Snippet");
    expect(out).toContain("total 1");
  });

  test("omitted --limit sends default limit=20 in request URL (aspect 3 bounded default)", async () => {
    let fetchedPath = "";
    const emptyBody: PaginatedListBody<SearchHit> = {
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async (path) => {
        fetchedPath = path;
        return emptyBody;
      }) as CliContext["fetchApi"],
      printJson: () => {},
    });

    await handleSearch(ctx, ["term"], {});

    expect(fetchedPath).toContain("limit=20");
  });
});
