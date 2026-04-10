import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBodyText, resolveExclusiveBody } from "./task-body";
import { CLI_ERR } from "./cli-error-codes";
import { CliError } from "./output";

describe("resolveExclusiveBody", () => {
  test("returns undefined when no source", () => {
    expect(resolveExclusiveBody({})).toBeUndefined();
  });

  test("accepts single flag body", () => {
    expect(resolveExclusiveBody({ body: "hello" })).toEqual({
      source: "flag",
      text: "hello",
    });
  });

  test("accepts file path only", () => {
    expect(resolveExclusiveBody({ bodyFile: " /tmp/x " })).toEqual({
      source: "file",
      text: "/tmp/x",
    });
  });

  test("accepts stdin flag only", () => {
    expect(resolveExclusiveBody({ bodyStdin: true })).toEqual({
      source: "stdin",
      text: "",
    });
  });

  test("rejects multiple sources", () => {
    expect(() =>
      resolveExclusiveBody({ body: "a", bodyStdin: true }),
    ).toThrow(CliError);
    try {
      resolveExclusiveBody({ body: "a", bodyFile: "f" });
    } catch (e) {
      expect((e as CliError).details?.code).toBe(
        CLI_ERR.conflictingInputSources,
      );
    }
  });
});

describe("loadBodyText", () => {
  test("returns flag text directly", async () => {
    await expect(
      loadBodyText({ source: "flag", text: "plain" }),
    ).resolves.toBe("plain");
  });

  test("throws when body file missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hirotm-body-"));
    const missing = join(dir, "nope.txt");
    await expect(
      loadBodyText({ source: "file", text: missing }),
    ).rejects.toMatchObject({
      exitCode: 3,
      details: expect.objectContaining({ code: CLI_ERR.fileNotFound, path: missing }),
    });
  });

  test("reads file when present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hirotm-body-"));
    const path = join(dir, "body.md");
    writeFileSync(path, "file-content", "utf8");
    await expect(loadBodyText({ source: "file", text: path })).resolves.toBe(
      "file-content",
    );
  });
});
