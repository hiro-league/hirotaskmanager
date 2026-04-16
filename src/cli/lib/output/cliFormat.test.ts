import { afterEach, describe, expect, test } from "bun:test";
import {
  getCliOutputFormat,
  getCliQuiet,
  resetCliOutputFormat,
  syncCliOutputFormatFromGlobals,
} from "./cliFormat";

describe("cliFormat global state", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("default is ndjson, quiet false", () => {
    expect(getCliOutputFormat()).toBe("ndjson");
    expect(getCliQuiet()).toBe(false);
  });

  test("sync sets human", () => {
    syncCliOutputFormatFromGlobals({ format: "human" });
    expect(getCliOutputFormat()).toBe("human");
  });

  test("sync sets quiet", () => {
    syncCliOutputFormatFromGlobals({ quiet: true });
    expect(getCliQuiet()).toBe(true);
  });

  test("reset clears to ndjson and not quiet", () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: true });
    resetCliOutputFormat();
    expect(getCliOutputFormat()).toBe("ndjson");
    expect(getCliQuiet()).toBe(false);
  });

  test("unknown format string is ignored — keeps current", () => {
    syncCliOutputFormatFromGlobals({ format: "human" });
    syncCliOutputFormatFromGlobals({ format: "xml" });
    expect(getCliOutputFormat()).toBe("human");
  });
});
