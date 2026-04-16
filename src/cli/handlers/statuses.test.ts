import { afterEach, describe, expect, test } from "bun:test";
import type { Status } from "../../shared/models";
import { syncCliOutputFormatFromGlobals } from "../lib/output/cliFormat";
import { createTestCliRuntime } from "../lib/core/runtime";
import { resetCliOutputFormat } from "../lib/output/output";
import { captureStdout } from "../lib/core/testHelpers";
import { createDefaultCliContext } from "./context";
import { handleStatusesList } from "./statuses";
import type { CliContext } from "./context";

function mockContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    ...createDefaultCliContext(),
    resolvePort: () => 3010,
    fetchApi: async () => {
      throw new Error("fetchApi not stubbed");
    },
    fetchApiMutate: async () => {
      throw new Error("fetchApiMutate not stubbed");
    },
    fetchApiTrashMutate: async () => {
      throw new Error("fetchApiTrashMutate not stubbed");
    },
    getRuntime: () => createTestCliRuntime({ port: 3010 }),
    ...overrides,
  };
}

describe("handleStatusesList", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("fetches /statuses and prints NDJSON lines", async () => {
    const rows: Status[] = [
      { statusId: "open", label: "Open", sortOrder: 0, isClosed: false },
    ];
    let path = "";
    const ctx = mockContext({
      fetchApi: (async (p) => {
        path = p;
        return rows;
      }) as CliContext["fetchApi"],
    });

    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const out = await captureStdout(() => handleStatusesList(ctx, {}));

    expect(path).toBe("/statuses");
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual(rows[0]);
  });

  test("--format human — StatusId, Label, Ord, Closed columns", async () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const rows: Status[] = [
      { statusId: "open", label: "Open", sortOrder: 0, isClosed: false },
    ];
    const ctx = mockContext({
      fetchApi: (async () => rows) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleStatusesList(ctx, {}));

    expect(out).toContain("StatusId");
    expect(out).toContain("Label");
    expect(out).toContain("Ord");
    expect(out).toContain("Closed");
    expect(out).toContain("open");
  });

  test("--quiet — statusId per line", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    const rows: Status[] = [
      { statusId: "in-progress", label: "Doing", sortOrder: 1, isClosed: false },
    ];
    const ctx = mockContext({
      fetchApi: (async () => rows) as CliContext["fetchApi"],
    });

    const out = await captureStdout(() => handleStatusesList(ctx, {}));

    expect(out.trimEnd()).toBe("in-progress");
  });
});
