import { describe, expect, test } from "bun:test";
import {
  clampTaskTitleInput,
  countGraphemes,
  normalizeStoredTaskTitle,
  TASK_TITLE_MAX_GRAPHEMES,
  taskTitleGraphemesRemaining,
  truncateToMaxGraphemes,
} from "./taskTitle";

describe("taskTitle grapheme helpers", () => {
  test("ASCII length uses grapheme count", () => {
    const s = "a".repeat(81);
    expect(countGraphemes(s)).toBe(81);
    expect(truncateToMaxGraphemes(s, 80).length).toBe(80);
    expect(normalizeStoredTaskTitle(s)).toBe("a".repeat(80));
  });

  test("CJK: one character per grapheme", () => {
    const s = "国".repeat(81);
    expect(countGraphemes(s)).toBe(81);
    expect(truncateToMaxGraphemes(s, 80)).toBe("国".repeat(80));
  });

  test("ZWJ emoji sequence counts as one grapheme when Segmenter is available", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(countGraphemes(family)).toBe(1);
    expect(truncateToMaxGraphemes(`${family}${"x".repeat(79)}`, 80).startsWith(family)).toBe(
      true,
    );
  });

  test("clampTaskTitleInput matches max constant", () => {
    const long = "b".repeat(100);
    expect(clampTaskTitleInput(long).length).toBe(TASK_TITLE_MAX_GRAPHEMES);
  });

  test("taskTitleGraphemesRemaining counts down to zero", () => {
    expect(taskTitleGraphemesRemaining("")).toBe(TASK_TITLE_MAX_GRAPHEMES);
    expect(taskTitleGraphemesRemaining("a".repeat(80))).toBe(0);
    expect(taskTitleGraphemesRemaining("a".repeat(100))).toBe(0);
  });
});
