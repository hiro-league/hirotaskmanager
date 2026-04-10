import { describe, expect, test } from "bun:test";
import type { PaginatedListBody } from "../../shared/pagination";
import { CLI_ERR } from "./cli-error-codes";
import {
  FIELDS_TASK,
  parseAndValidateFields,
  projectArrayItems,
  projectPaginatedItems,
  projectRecord,
} from "./jsonFieldProjection";
import { CliError } from "./output";

describe("jsonFieldProjection", () => {
  test("parseAndValidateFields returns undefined for empty", () => {
    expect(parseAndValidateFields(undefined, FIELDS_TASK)).toBeUndefined();
    expect(parseAndValidateFields("", FIELDS_TASK)).toBeUndefined();
    expect(parseAndValidateFields("  ", FIELDS_TASK)).toBeUndefined();
  });

  test("parseAndValidateFields trims and splits", () => {
    expect(parseAndValidateFields(" taskId, title ", FIELDS_TASK)).toEqual([
      "taskId",
      "title",
    ]);
  });

  test("parseAndValidateFields rejects unknown keys", () => {
    try {
      parseAndValidateFields("taskId,nope", FIELDS_TASK);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      const err = e as CliError;
      expect(err.exitCode).toBe(2);
      expect(err.details?.code).toBe(CLI_ERR.invalidValue);
    }
  });

  test("projectRecord preserves order and skips missing", () => {
    const row = { taskId: 1, title: "T", body: "B" };
    expect(projectRecord(row, ["title", "taskId"])).toEqual({
      title: "T",
      taskId: 1,
    });
    expect(projectRecord(row, ["title", "missing"])).toEqual({ title: "T" });
  });

  test("projectPaginatedItems keeps envelope", () => {
    const body: PaginatedListBody<Record<string, unknown>> = {
      items: [{ taskId: 1, title: "A" }],
      total: 1,
      limit: 10,
      offset: 0,
    };
    const out = projectPaginatedItems(body, ["taskId"]);
    expect(out).toEqual({
      items: [{ taskId: 1 }],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  test("projectArrayItems", () => {
    const rows = [{ taskId: 1, x: 2 }];
    expect(projectArrayItems(rows, ["taskId"])).toEqual([{ taskId: 1 }]);
  });
});
