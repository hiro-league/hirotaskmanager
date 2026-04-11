import { describe, expect, test } from "bun:test";
import { CLI_ERR } from "../types/errors";
import { CliError } from "./output";
import { assertMutuallyExclusive } from "./validation";

describe("assertMutuallyExclusive", () => {
  test("no-ops when pairs are compatible", () => {
    assertMutuallyExclusive([
      ["--emoji", undefined, "--clear-emoji", false],
      ["--emoji", "x", "--clear-emoji", false],
      ["--emoji", undefined, "--clear-emoji", true],
    ]);
  });

  test("throws when value is set with clear flag", () => {
    expect(() =>
      assertMutuallyExclusive([
        ["--emoji", "a", "--clear-emoji", true],
      ]),
    ).toThrow(CliError);

    try {
      assertMutuallyExclusive([
        ["--color", "#fff", "--clear-color", true],
      ]);
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      const err = e as CliError;
      expect(err.exitCode).toBe(2);
      expect(err.details?.code).toBe(CLI_ERR.mutuallyExclusiveOptions);
      expect(err.message).toContain("--color");
      expect(err.message).toContain("--clear-color");
    }
  });
});
