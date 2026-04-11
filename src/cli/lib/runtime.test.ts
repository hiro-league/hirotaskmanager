import { afterEach, describe, expect, test } from "bun:test";
import { syncCliOutputFormatFromGlobals } from "./cliFormat";
import { resetCliOutputFormat } from "./output";
import { captureCliRuntime, createTestCliRuntime } from "./runtime";

describe("createTestCliRuntime", () => {
  test("fills defaults and applies overrides", () => {
    const r = createTestCliRuntime({ port: 3002, quiet: true });
    expect(r.outputFormat).toBe("ndjson");
    expect(r.clientName).toBe("hirotm");
    expect(r.port).toBe(3002);
    expect(r.quiet).toBe(true);
  });
});

describe("captureCliRuntime", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("reflects cliFormat globals", () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: true });
    const r = captureCliRuntime();
    expect(r.outputFormat).toBe("human");
    expect(r.quiet).toBe(true);
  });
});
