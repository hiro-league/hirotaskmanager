import { afterEach, describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import type { List } from "../../shared/models";
import { CLI_ERR } from "../types/errors";
import { syncCliOutputFormatFromGlobals } from "../lib/output/cliFormat";
import { createTestCliRuntime } from "../lib/core/runtime";
import { resetCliOutputFormat } from "../lib/output/output";
import { captureStdout } from "../lib/core/testHelpers";
import { createDefaultCliContext } from "./context";
import { handleListsList } from "./lists";
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

describe("handleListsList", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  const listRow: List = {
    listId: 1,
    name: "Todo",
    order: 0,
    color: "#fff",
    emoji: null,
    createdByPrincipal: "web",
    createdByLabel: null,
  };

  test("NDJSON — one line per list with listId, name, order", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const envelope: PaginatedListBody<List> = {
      items: [listRow],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleListsList(ctx, { board: "wb" }),
    );

    const row = JSON.parse(out.trim().split("\n")[0]!) as List;
    expect(row.listId).toBe(1);
    expect(row.name).toBe("Todo");
    expect(row.order).toBe(0);
  });

  test("--format human — table with Ord, Color, Em", async () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const envelope: PaginatedListBody<List> = {
      items: [listRow],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleListsList(ctx, { board: "wb" }),
    );

    expect(out).toContain("Ord");
    expect(out).toContain("Color");
    expect(out).toContain("Em");
    expect(out).toContain("Todo");
  });

  test("--quiet — listId per line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const envelope: PaginatedListBody<List> = {
      items: [listRow],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleListsList(ctx, { board: "wb" }),
    );

    expect(out.trimEnd()).toBe("1");
  });

  test("--fields listId,name — projected", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const envelope: PaginatedListBody<List> = {
      items: [listRow],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleListsList(ctx, { board: "wb", fields: "listId,name" }),
    );

    const row = JSON.parse(out.trim()) as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["listId", "name"]);
  });

  test("--page-all merges two pages", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    let call = 0;
    const ctx = mockContext({
      fetchApi: (async () => {
        if (call++ === 0) {
          return {
            items: [{ ...listRow, listId: 1, name: "A" }],
            total: 2,
            limit: 2,
            offset: 0,
          } satisfies PaginatedListBody<List>;
        }
        return {
          items: [{ ...listRow, listId: 2, name: "B" }],
          total: 2,
          limit: 2,
          offset: 0,
        } satisfies PaginatedListBody<List>;
      }) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleListsList(ctx, { board: "wb", pageAll: true, limit: "2" }),
    );

    expect(out.trimEnd().split("\n").length).toBe(2);
  });

  test("missing --board — exit 2 missing_required", async () => {
    const ctx = mockContext({
      fetchApi: (async () => ({
        items: [],
        total: 0,
        limit: 0,
        offset: 0,
      })) as CliContext["fetchApi"],
    });

    await expect(
      handleListsList(ctx, { board: "" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.missingRequired }),
    });
  });
});
