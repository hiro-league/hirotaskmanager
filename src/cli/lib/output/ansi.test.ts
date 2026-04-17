import { afterEach, describe, expect, test } from "bun:test";
import { ansi, resetCliAnsi, syncCliAnsiFromGlobals } from "./ansi";

describe("ansi", () => {
  afterEach(() => {
    resetCliAnsi();
  });

  test("--no-color (sync color === false) forces plain strings", () => {
    syncCliAnsiFromGlobals({ color: false });
    expect(ansi.dim).toBe("");
    expect(ansi.bold).toBe("");
    expect(ansi.red).toBe("");
    expect(ansi.reset).toBe("");
  });

  test("TERM=dumb forces plain strings when flag sync leaves color enabled", () => {
    const prev = process.env.TERM;
    process.env.TERM = "dumb";
    resetCliAnsi();
    syncCliAnsiFromGlobals({ color: true });
    try {
      expect(ansi.dim).toBe("");
    } finally {
      if (prev === undefined) delete process.env.TERM;
      else process.env.TERM = prev;
    }
  });

  test("NO_COLOR forces plain strings when flag sync leaves color enabled", () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    resetCliAnsi();
    syncCliAnsiFromGlobals({ color: true });
    try {
      expect(ansi.bold).toBe("");
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = prev;
    }
  });
});
