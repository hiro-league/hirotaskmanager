import { describe, expect, test } from "bun:test";
import { linesForHumanObject } from "./humanText";

/** Strip ANSI escape sequences for stable assertions (TTY may enable ansi). */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("linesForHumanObject", () => {
  test("flat object — id and name lines", () => {
    const lines = linesForHumanObject({ id: 1, name: "A" }).map(stripAnsi);
    expect(lines).toContain("id: 1");
    expect(lines).toContain("name: A");
  });

  test("nested object — a.b path", () => {
    const lines = linesForHumanObject({ a: { b: 1 } }).map(stripAnsi);
    expect(lines.some((l) => l.includes("a.b: 1"))).toBe(true);
  });

  test("array value — JSON in line", () => {
    const lines = linesForHumanObject({ tags: [1, 2] }).map(stripAnsi);
    expect(lines.some((l) => l.includes("[1,2]"))).toBe(true);
  });

  test("null root — single line value: null", () => {
    const lines = linesForHumanObject(null).map(stripAnsi);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("null");
  });

  test("empty object — no lines", () => {
    expect(linesForHumanObject({})).toEqual([]);
  });
});
