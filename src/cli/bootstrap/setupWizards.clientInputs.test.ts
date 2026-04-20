import { describe, expect, test } from "bun:test";
import { CliError } from "../lib/output/output";
import { CLI_ERR } from "../types/errors";
import {
  normalizeClientApiUrl,
  validateCliApiKeyInput,
} from "./setupWizards";

// Issue #31343: the client setup wizard used to exit on the first invalid
// api_url / api_key. The fix is `promptValidatedWithDefault`, which loops as
// long as the validator throws a `CliError`. These tests pin the validator
// contract that drives that loop: throw `CliError` on bad input, return the
// normalized value on good input. The wizard's prompt loop is a thin wrapper
// over these.

describe("normalizeClientApiUrl (issue #31343)", () => {
  test("rejects bare hostname with actionable scheme hint", () => {
    expect(() =>
      normalizeClientApiUrl("hirotm.rewayatuniverse.com"),
    ).toThrow(CliError);
    try {
      normalizeClientApiUrl("hirotm.rewayatuniverse.com");
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      const e = err as CliError;
      expect(e.message).toContain("hirotm.rewayatuniverse.com");
      expect(e.message).toContain("https://");
      expect(e.details).toMatchObject({
        code: CLI_ERR.invalidValue,
        field: "api_url",
      });
    }
  });

  test("rejects scheme-less placeholder default 'https://'", () => {
    // Prior behavior offered "[https://]" as a default; accepting it produced
    // a confusing error. Now this is just one more invalid input the loop
    // re-prompts on.
    expect(() => normalizeClientApiUrl("https://")).toThrow(CliError);
  });

  test("rejects non-http(s) scheme with actionable message", () => {
    try {
      normalizeClientApiUrl("ftp://example.com");
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      const e = err as CliError;
      expect(e.message).toContain("http://");
      expect(e.message).toContain("https://");
      expect(e.details).toMatchObject({
        code: CLI_ERR.invalidValue,
        field: "api_url",
      });
      return;
    }
    throw new Error("expected normalizeClientApiUrl to throw");
  });

  test("accepts a valid https URL and strips trailing slashes", () => {
    expect(normalizeClientApiUrl("https://tm.example.com/")).toBe(
      "https://tm.example.com",
    );
    expect(normalizeClientApiUrl("  https://tm.example.com  ")).toBe(
      "https://tm.example.com",
    );
  });

  test("accepts http loopback without throwing", () => {
    expect(normalizeClientApiUrl("http://127.0.0.1:3002")).toBe(
      "http://127.0.0.1:3002",
    );
  });
});

describe("validateCliApiKeyInput (issue #31343)", () => {
  const goodKey = `tmk-${"a".repeat(64)}`;

  test("rejects empty / whitespace-only input as missing_required", () => {
    for (const bad of ["", "   ", "\t\n"]) {
      try {
        validateCliApiKeyInput(bad);
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        const e = err as CliError;
        expect(e.details).toMatchObject({
          code: CLI_ERR.missingRequired,
          field: "api_key",
        });
        continue;
      }
      throw new Error(`expected throw for input ${JSON.stringify(bad)}`);
    }
  });

  test("rejects malformed key as invalid_value", () => {
    for (const bad of [
      "not-a-key",
      "tmk-abc",
      `tmk-${"z".repeat(64)}`, // non-hex
      `tmk-${"a".repeat(63)}`, // too short
      `TMK-${"a".repeat(64)}`, // wrong-case prefix
      `Bearer tmk-${"a".repeat(64)}`, // we intentionally do NOT strip Bearer
    ]) {
      try {
        validateCliApiKeyInput(bad);
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        const e = err as CliError;
        expect(e.details).toMatchObject({
          code: CLI_ERR.invalidValue,
          field: "api_key",
        });
        continue;
      }
      throw new Error(`expected throw for input ${JSON.stringify(bad)}`);
    }
  });

  test("accepts a well-formed key and returns it trimmed", () => {
    expect(validateCliApiKeyInput(`  ${goodKey}  `)).toBe(goodKey);
    expect(validateCliApiKeyInput(goodKey)).toBe(goodKey);
  });
});
