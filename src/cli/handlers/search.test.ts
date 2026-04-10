import { describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import type { SearchHit } from "../../shared/models";
import { CLI_ERR } from "../lib/cli-error-codes";
import { handleSearch } from "./search";
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

describe("handleSearch", () => {
  test("requires non-empty query", async () => {
    const ctx = mockContext();
    await expect(handleSearch(ctx, ["", "  "], {})).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });

  test("rejects invalid format", async () => {
    const ctx = mockContext();
    await expect(
      handleSearch(ctx, ["x"], { format: "xml" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
    });
  });

  test("json output prints hits", async () => {
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
    let printed: unknown;
    let fetchedPath = "";
    const ctx = mockContext({
      fetchApi: (async (path) => {
        fetchedPath = path;
        return body;
      }) as CliContext["fetchApi"],
      printJson: (d) => {
        printed = d;
      },
    });

    await handleSearch(ctx, ["hello", "world"], {
      board: "b1",
      limit: "5",
      noPrefix: true,
    });

    expect(fetchedPath).toContain("/search?");
    expect(fetchedPath).toContain("q=hello+world");
    expect(fetchedPath).toContain("limit=5");
    expect(fetchedPath).toContain("board=b1");
    expect(fetchedPath).toContain("prefix=0");
    expect(printed).toEqual(body);
  });

  test("rejects --fields with --format table", async () => {
    const ctx = mockContext();
    await expect(
      handleSearch(ctx, ["q"], { format: "table", fields: "taskId" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
    });
  });

  test("json --fields projects items", async () => {
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
    let printed: unknown;
    const ctx = mockContext({
      fetchApi: (async () => body) as CliContext["fetchApi"],
      printJson: (d) => {
        printed = d;
      },
    });

    await handleSearch(ctx, ["q"], { fields: "taskId,title" });

    expect(printed).toEqual({
      items: [{ taskId: 9, title: "T" }],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  test("table output uses printSearchTable", async () => {
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
    let tableHits: SearchHit[] | undefined;
    const body: PaginatedListBody<SearchHit> = {
      items: hits,
      total: 1,
      limit: 20,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => body) as CliContext["fetchApi"],
      printSearchTable: (h) => {
        tableHits = h;
      },
    });

    await handleSearch(ctx, ["q"], { format: "table" });

    expect(tableHits).toEqual(hits);
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
