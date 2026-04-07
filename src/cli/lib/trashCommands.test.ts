import { describe, expect, test } from "bun:test";
import type { TrashedBoardItem } from "../../shared/trashApi";
import {
  parseTrashedBoardNumericId,
  resolveTrashedBoardIdFromSlug,
} from "./trashCommands";

describe("trash board id resolution", () => {
  test("parseTrashedBoardNumericId accepts digits", () => {
    expect(parseTrashedBoardNumericId("42")).toBe(42);
    expect(parseTrashedBoardNumericId(" 7 ")).toBe(7);
  });

  test("parseTrashedBoardNumericId returns undefined for slug-like input", () => {
    expect(parseTrashedBoardNumericId("my-board")).toBeUndefined();
    expect(parseTrashedBoardNumericId("12a")).toBeUndefined();
  });

  test("resolveTrashedBoardIdFromSlug matches slug case-insensitively", () => {
    const rows: TrashedBoardItem[] = [
      {
        type: "board",
        id: 3,
        name: "A",
        slug: "Alpha",
        emoji: null,
        deletedAt: "",
        canRestore: true,
      },
    ];
    expect(resolveTrashedBoardIdFromSlug("alpha", rows)).toBe(3);
    expect(resolveTrashedBoardIdFromSlug("ALPHA", rows)).toBe(3);
  });

  test("resolveTrashedBoardIdFromSlug throws when missing", () => {
    expect(() =>
      resolveTrashedBoardIdFromSlug("nope", []),
    ).toThrow("Board not in Trash");
  });
});
