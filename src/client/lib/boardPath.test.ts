import { describe, expect, test } from "vitest";
import { boardPath, LAST_BOARD_STORAGE_KEY, parseBoardIdFromPath } from "./boardPath";

describe("boardPath", () => {
  test("LAST_BOARD_STORAGE_KEY is stable", () => {
    expect(LAST_BOARD_STORAGE_KEY).toBe("taskmanager:lastBoardId");
  });

  test("boardPath encodes id in URL segment", () => {
    expect(boardPath(42)).toBe("/board/42");
    expect(boardPath("my-id")).toBe("/board/my-id");
  });

  test("parseBoardIdFromPath extracts board id", () => {
    expect(parseBoardIdFromPath("/board/7")).toBe("7");
    expect(parseBoardIdFromPath("/board/7/")).toBe("7");
    expect(parseBoardIdFromPath("/board/a%20b")).toBe("a b");
    expect(parseBoardIdFromPath("/")).toBeNull();
    expect(parseBoardIdFromPath("/trash")).toBeNull();
  });
});
