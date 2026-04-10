import { describe, expect, test } from "bun:test";
import type { ReleaseDefinition } from "./models";
import { mergeReleaseUpsertIntoList } from "./boardReleaseMerge";

function rel(
  releaseId: number,
  name: string,
  createdAt: string,
): ReleaseDefinition {
  return { releaseId, name, createdAt };
}

describe("mergeReleaseUpsertIntoList", () => {
  test("appends and sorts by createdAt then releaseId", () => {
    const a = rel(1, "A", "2020-01-02T00:00:00.000Z");
    const b = rel(2, "B", "2020-01-01T00:00:00.000Z");
    expect(mergeReleaseUpsertIntoList([a], b).map((r) => r.releaseId)).toEqual([
      2, 1,
    ]);
  });

  test("replaces same releaseId", () => {
    const a = rel(1, "Old", "2020-01-01T00:00:00.000Z");
    const next = rel(1, "New", "2020-01-01T00:00:00.000Z");
    const out = mergeReleaseUpsertIntoList([a], next);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("New");
  });
});
