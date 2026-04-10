import { describe, expect, test } from "bun:test";
import { Command } from "commander";
import {
  addPortOption,
  addProfileOption,
  collectMultiValue,
  parseLimitOption,
  parsePortOption,
} from "./command-helpers";
import { CLI_ERR } from "./cli-error-codes";
import { CliError } from "./output";

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

describe("addPortOption / addProfileOption", () => {
  test("register options on a Commander command", () => {
    const cmd = new Command("x");
    addPortOption(cmd);
    addProfileOption(cmd);
    const defs = cmd.options.map((o) => o.long);
    expect(defs).toContain("--port");
    expect(defs).toContain("--client-name");
    expect(defs).toContain("--profile");
  });
});
