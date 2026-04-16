import { describe, expect, test } from "vitest";
import { boardCollapsedLabel } from "./boardCollapsedLabel";

describe("boardCollapsedLabel", () => {
  test("uses first grapheme of emoji when set", () => {
    expect(boardCollapsedLabel("My Board", "🚀")).toBe("🚀");
  });

  test("single word name uses up to two letters uppercase", () => {
    expect(boardCollapsedLabel("Hello", null)).toBe("HE");
  });

  test("multi-word name uses initials", () => {
    expect(boardCollapsedLabel("Hello World", null)).toBe("HW");
  });

  test("empty name yields placeholder", () => {
    expect(boardCollapsedLabel("  ", null)).toBe("?");
  });
});
