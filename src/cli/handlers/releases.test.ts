import { afterEach, describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import type { ReleaseDefinition } from "../../shared/models";
import { CLI_ERR } from "../types/errors";
import { syncCliOutputFormatFromGlobals } from "../lib/cliFormat";
import { createTestCliRuntime } from "../lib/runtime";
import { resetCliOutputFormat } from "../lib/output";
import { captureStdout } from "../lib/testHelpers";
import { createDefaultCliContext } from "./context";
import { handleReleasesList, handleReleasesShow } from "./releases";
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

const rel = (id: number, name: string): ReleaseDefinition => ({
  releaseId: id,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("handleReleasesList", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("NDJSON — one line per release", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const envelope: PaginatedListBody<ReleaseDefinition> = {
      items: [rel(1, "v1")],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleReleasesList(ctx, { board: "b" }),
    );

    const row = JSON.parse(out.trim()) as ReleaseDefinition;
    expect(row.releaseId).toBe(1);
    expect(row.name).toBe("v1");
  });

  test("--format human — Id, Name, Date, Color", async () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const envelope: PaginatedListBody<ReleaseDefinition> = {
      items: [rel(1, "v1")],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleReleasesList(ctx, { board: "b" }),
    );

    expect(out).toContain("Name");
    expect(out).toContain("Date");
    expect(out).toContain("Color");
    expect(out).toContain("v1");
  });

  test("--quiet — releaseId per line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const envelope: PaginatedListBody<ReleaseDefinition> = {
      items: [rel(9, "x")],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleReleasesList(ctx, { board: "b" }),
    );

    expect(out.trimEnd()).toBe("9");
  });

  test("--fields releaseId,name — projected", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const envelope: PaginatedListBody<ReleaseDefinition> = {
      items: [rel(3, "R")],
      total: 1,
      limit: 1,
      offset: 0,
    };
    const ctx = mockContext({
      fetchApi: (async () => envelope) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleReleasesList(ctx, { board: "b", fields: "releaseId,name" }),
    );

    const row = JSON.parse(out.trim()) as Record<string, unknown>;
    expect(row).toEqual({ releaseId: 3, name: "R" });
  });
});

describe("handleReleasesShow", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("NDJSON — single release JSON line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const ctx = mockContext({
      fetchApi: (async (path: string) => {
        if (path.includes("/boards/brd/releases?")) {
          return {
            items: [rel(5, "ShowMe")],
            total: 1,
            limit: 500,
            offset: 0,
          } satisfies PaginatedListBody<ReleaseDefinition>;
        }
        throw new Error(`unexpected path ${path}`);
      }) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleReleasesShow(ctx, "5", { board: "brd" }),
    );

    const parsed = JSON.parse(out.trim()) as ReleaseDefinition;
    expect(parsed.releaseId).toBe(5);
    expect(parsed.name).toBe("ShowMe");
  });

  test("--format human — labeled stdout lines", async () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const ctx = mockContext({
      fetchApi: (async () => ({
        items: [rel(2, "H")],
        total: 1,
        limit: 500,
        offset: 0,
      })) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() =>
      handleReleasesShow(ctx, "2", { board: "b" }),
    );

    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("releaseId");
    expect(out).toContain("H");
  });

  test("release not in list — exit 3 not_found", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const ctx = mockContext({
      fetchApi: (async () => ({
        items: [rel(1, "other")],
        total: 1,
        limit: 500,
        offset: 0,
      })) as CliContext["fetchApi"],
    });

    await expect(
      handleReleasesShow(ctx, "99", { board: "b" }),
    ).rejects.toMatchObject({
      exitCode: 3,
      details: expect.objectContaining({ code: CLI_ERR.notFound }),
    });
  });
});
