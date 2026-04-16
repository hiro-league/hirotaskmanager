import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Command } from "commander";
import {
  addClientNameOption,
  addProfileOption,
  addYesOption,
  cliAction,
  collectMultiValue,
  parseLimitOption,
  parsePortOption,
  requireNdjsonWhenQuiet,
  requireNdjsonWhenUsingFields,
  resolveQuietExplicitField,
} from "./command-helpers";
import {
  resetCliOutputFormat,
  syncCliOutputFormatFromGlobals,
} from "../output/cliFormat";
import { CLI_ERR } from "../../types/errors";
import { CliError } from "../output/output";

describe("parsePortOption", () => {
  test("returns undefined for empty / whitespace", () => {
    expect(parsePortOption(undefined)).toBeUndefined();
    expect(parsePortOption("")).toBeUndefined();
    expect(parsePortOption("   ")).toBeUndefined();
  });

  test("accepts positive integer", () => {
    expect(parsePortOption("3002")).toBe(3002);
    expect(parsePortOption(" 1 ")).toBe(1);
  });

  test("rejects invalid port with exit 2", () => {
    expect(() => parsePortOption("abc")).toThrow(CliError);
    try {
      parsePortOption("abc");
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).exitCode).toBe(2);
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidValue);
    }
    expect(() => parsePortOption("0")).toThrow(CliError);
    expect(() => parsePortOption("3.5")).toThrow(CliError);
  });
});

describe("collectMultiValue", () => {
  test("splits on comma, trims, filters empty, accumulates", () => {
    expect(collectMultiValue("a, b")).toEqual(["a", "b"]);
    expect(collectMultiValue("x,, y", ["p"])).toEqual(["p", "x", "y"]);
  });
});

describe("parseLimitOption", () => {
  test("defaults to 20 when null or empty string", () => {
    expect(parseLimitOption(undefined as unknown as string)).toBe(20);
    expect(parseLimitOption("")).toBe(20);
  });

  test("caps at 500", () => {
    expect(parseLimitOption("900")).toBe(500);
    expect(parseLimitOption("500")).toBe(500);
  });

  test("rejects non-integer or < 1", () => {
    expect(() => parseLimitOption("0")).toThrow(CliError);
    expect(() => parseLimitOption("x")).toThrow(CliError);
  });
});

describe("cliAction", () => {
  test("forwards arguments and awaits the handler", async () => {
    const calls: unknown[][] = [];
    const wrapped = cliAction(async (a: number, b: string) => {
      calls.push([a, b]);
    });
    await wrapped(1, "x");
    expect(calls).toEqual([[1, "x"]]);
  });
});

describe("addClientNameOption / addProfileOption / addYesOption", () => {
  test("register options on a Commander command", () => {
    const cmd = new Command("x");
    addClientNameOption(addYesOption(cmd));
    addProfileOption(cmd);
    const defs = cmd.options.map((o) => o.long);
    expect(defs).toContain("--yes");
    expect(defs).toContain("--client-name");
    expect(defs).toContain("--profile");
  });
});

describe("global option guards (quiet / fields vs format)", () => {
  beforeEach(() => {
    resetCliOutputFormat();
  });

  afterEach(() => {
    resetCliOutputFormat();
  });

  test("requireNdjsonWhenQuiet — quiet + human → exit 2", () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: true });
    expect(() => requireNdjsonWhenQuiet()).toThrow(CliError);
    try {
      requireNdjsonWhenQuiet();
    } catch (e) {
      expect((e as CliError).exitCode).toBe(2);
      expect((e as CliError).message).toContain("--quiet requires");
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidValue);
    }
  });

  test("requireNdjsonWhenQuiet — quiet + ndjson → ok", () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    expect(() => requireNdjsonWhenQuiet()).not.toThrow();
  });

  test("requireNdjsonWhenUsingFields — fields + human → exit 2", () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    expect(() => requireNdjsonWhenUsingFields(["boardId"])).toThrow(CliError);
    try {
      requireNdjsonWhenUsingFields(["boardId"]);
    } catch (e) {
      expect((e as CliError).message).toContain("--fields requires");
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidValue);
    }
  });

  test("requireNdjsonWhenUsingFields — fields + ndjson → ok", () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    expect(() => requireNdjsonWhenUsingFields(["boardId"])).not.toThrow();
  });

  test("resolveQuietExplicitField — one field ok", () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    expect(resolveQuietExplicitField(["slug"])).toBe("slug");
  });

  test("resolveQuietExplicitField — two fields + quiet → exit 2", () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: true });
    expect(() => resolveQuietExplicitField(["a", "b"])).toThrow(CliError);
    try {
      resolveQuietExplicitField(["a", "b"]);
    } catch (e) {
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidValue);
    }
  });
});
