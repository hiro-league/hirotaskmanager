import { describe, expect, test } from "bun:test";
import { parseOptionalEmojiFlag } from "./emoji-cli";
import { CLI_ERR } from "./cli-error-codes";
import { CliError } from "./output";

describe("parseOptionalEmojiFlag", () => {
  test("omits when undefined", () => {
    expect(parseOptionalEmojiFlag(undefined)).toEqual({ omit: true });
  });

  test("clears when blank string", () => {
    expect(parseOptionalEmojiFlag("  ")).toEqual({
      omit: false,
      value: null,
    });
  });

  test("returns trimmed value when valid", () => {
    expect(parseOptionalEmojiFlag(" 🚀 ")).toEqual({
      omit: false,
      value: "🚀",
    });
  });

  test("throws when too many graphemes", () => {
    // Reason: enforce MAX_EMOJI_GRAPHEMES (10) — long ASCII string exceeds limit.
    const tooLong = "a".repeat(11);
    expect(() => parseOptionalEmojiFlag(tooLong)).toThrow(CliError);
    try {
      parseOptionalEmojiFlag(tooLong);
    } catch (e) {
      expect((e as CliError).exitCode).toBe(2);
      expect((e as CliError).details?.code).toBe(CLI_ERR.emojiValidation);
    }
  });
});
