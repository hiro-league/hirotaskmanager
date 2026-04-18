import { describe, expect, test } from "bun:test";
import type { ReleaseDefinition } from "./models";
import { sortReleasesForDisplay } from "./releaseSort";

describe("sortReleasesForDisplay", () => {
  test("null dates last; dated desc", () => {
    const rels: ReleaseDefinition[] = [
      {
        releaseId: 1,
        name: "a",
        releaseDate: "2024-01-01",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        releaseId: 2,
        name: "b",
        releaseDate: null,
        createdAt: "2024-06-01T00:00:00.000Z",
      },
      {
        releaseId: 3,
        name: "c",
        releaseDate: "2025-01-01",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    const s = sortReleasesForDisplay(rels);
    expect(s.map((r) => r.releaseId)).toEqual([3, 1, 2]);
  });

  test("undated rows alphabetical by name", () => {
    const rels: ReleaseDefinition[] = [
      {
        releaseId: 10,
        name: "Zebra",
        releaseDate: null,
        createdAt: "2024-03-01T00:00:00.000Z",
      },
      {
        releaseId: 11,
        name: "alpha",
        releaseDate: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        releaseId: 12,
        name: "Beta",
        releaseDate: null,
        createdAt: "2024-02-01T00:00:00.000Z",
      },
    ];
    const s = sortReleasesForDisplay(rels);
    expect(s.map((r) => r.releaseId)).toEqual([11, 12, 10]);
  });

  test("same date tie-breaks by createdAt desc then releaseId desc", () => {
    const rels: ReleaseDefinition[] = [
      {
        releaseId: 1,
        name: "older",
        releaseDate: "2025-06-01",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
      {
        releaseId: 2,
        name: "newer",
        releaseDate: "2025-06-01",
        createdAt: "2025-06-15T00:00:00.000Z",
      },
    ];
    const s = sortReleasesForDisplay(rels);
    expect(s.map((r) => r.releaseId)).toEqual([2, 1]);
  });
});
