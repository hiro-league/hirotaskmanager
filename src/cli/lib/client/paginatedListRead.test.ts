/**
 * executePaginatedListRead: field validation → limit/offset → page-all → projection → print.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { CLI_ERR } from "../../types/errors";
import { FIELDS_TASK } from "../core/jsonFieldProjection";
import { COLUMNS_TASKS_LIST } from "../core/listTableSpecs";
import { executePaginatedListRead } from "./paginatedListRead";
import {
  resetCliOutputFormat,
  syncCliOutputFormatFromGlobals,
} from "../output/cliFormat";
import { captureStdout } from "../core/testHelpers";

type TaskRow = { taskId: number; title: string };

describe("executePaginatedListRead (optionalLimit)", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("default single page — fetchPage once; NDJSON lines match items", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const paths: string[] = [];
    const spec = {
      kind: "optionalLimit" as const,
      basePath: "/api/boards/brd/tasks",
      fieldAllowlist: FIELDS_TASK,
      columns: COLUMNS_TASKS_LIST,
      quietDefaults: ["taskId"] as const,
      async fetchPage(path: string) {
        paths.push(path);
        return {
          items: [{ taskId: 1, title: "One" } as TaskRow],
          total: 1,
          limit: 1,
          offset: 0,
        };
      },
    };
    const out = await captureStdout(() =>
      executePaginatedListRead(spec, {}),
    );
    expect(paths).toEqual(["/api/boards/brd/tasks"]);
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ taskId: 1, title: "One" });
  });

  test("--limit 5 --offset 10 — path contains limit=5 and offset=10", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    let sawPath = "";
    const spec = {
      kind: "optionalLimit" as const,
      basePath: "/api/boards/brd/tasks",
      fieldAllowlist: FIELDS_TASK,
      columns: COLUMNS_TASKS_LIST,
      quietDefaults: ["taskId"] as const,
      async fetchPage(path: string) {
        sawPath = path;
        return {
          items: [],
          total: 0,
          limit: 0,
          offset: 0,
        };
      },
    };
    await captureStdout(() =>
      executePaginatedListRead(spec, { limit: "5", offset: "10" }),
    );
    expect(sawPath).toContain("limit=5");
    expect(sawPath).toContain("offset=10");
  });

  test("--page-all — fetchAllPages merges pages; stdout has all items", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const paths: string[] = [];
    let call = 0;
    const spec = {
      kind: "optionalLimit" as const,
      basePath: "/api/boards/brd/tasks",
      fieldAllowlist: FIELDS_TASK,
      columns: COLUMNS_TASKS_LIST,
      quietDefaults: ["taskId"] as const,
      async fetchPage(path: string) {
        paths.push(path);
        if (call++ === 0) {
          return {
            items: [{ taskId: 1, title: "A" } as TaskRow],
            total: 2,
            limit: 2,
            offset: 0,
          };
        }
        return {
          items: [{ taskId: 2, title: "B" } as TaskRow],
          total: 2,
          limit: 2,
          offset: 0,
        };
      },
    };
    const out = await captureStdout(() =>
      executePaginatedListRead(spec, { pageAll: true, limit: "2" }),
    );
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
    const ids = lines.map((l) => (JSON.parse(l) as TaskRow).taskId).sort();
    expect(ids).toEqual([1, 2]);
  });

  test("--fields taskId,title — each stdout line only has those keys", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const spec = {
      kind: "optionalLimit" as const,
      basePath: "/api/boards/brd/tasks",
      fieldAllowlist: FIELDS_TASK,
      columns: COLUMNS_TASKS_LIST,
      quietDefaults: ["taskId"] as const,
      async fetchPage() {
        return {
          items: [
            {
              taskId: 9,
              title: "T",
              listId: 3,
              body: "x",
            } as TaskRow & { listId: number; body: string },
          ],
          total: 1,
          limit: 1,
          offset: 0,
        };
      },
    };
    const out = await captureStdout(() =>
      executePaginatedListRead(spec, { fields: "taskId,title" }),
    );
    const row = JSON.parse(out.trim().split("\n")[0]!) as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["taskId", "title"]);
    expect(row.taskId).toBe(9);
    expect(row.title).toBe("T");
  });

  test("--fields unknownKey — CliError exit 2, invalid_value", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const spec = {
      kind: "optionalLimit" as const,
      basePath: "/api/boards/brd/tasks",
      fieldAllowlist: FIELDS_TASK,
      columns: COLUMNS_TASKS_LIST,
      quietDefaults: ["taskId"] as const,
      async fetchPage() {
        return { items: [], total: 0, limit: 0, offset: 0 };
      },
    };
    await expect(
      executePaginatedListRead(spec, { fields: "unknownKey" }),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
    });
  });

  test("--page-all --limit 3 — page size 3 in fetch URLs", async () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const paths: string[] = [];
    let call = 0;
    const spec = {
      kind: "optionalLimit" as const,
      basePath: "/api/boards/brd/tasks",
      fieldAllowlist: FIELDS_TASK,
      columns: COLUMNS_TASKS_LIST,
      quietDefaults: ["taskId"] as const,
      async fetchPage(path: string) {
        paths.push(path);
        if (call++ === 0) {
          expect(path).toContain("limit=3");
          expect(path).not.toContain("offset=");
          return {
            items: [{ taskId: 1, title: "A" } as TaskRow],
            total: 1,
            limit: 3,
            offset: 0,
          };
        }
        throw new Error("unexpected second page");
      },
    };
    await captureStdout(() =>
      executePaginatedListRead(spec, { pageAll: true, limit: "3" }),
    );
    expect(paths.length).toBe(1);
  });
});
