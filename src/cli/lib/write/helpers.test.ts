/**
 * write/helpers: release flags, exclusive text input, id parsing (cli-test-plan §8.4).
 */
import { describe, expect, test } from "bun:test";
import type { Board } from "../../../shared/models";
import { CLI_ERR } from "../../types/errors";
import {
  parseCliReleaseFlags,
  parsePositiveInt,
  parseTaskId,
  resolveCliReleaseToApiValue,
  resolveExclusiveTextInput,
} from "./helpers";

describe("parseCliReleaseFlags", () => {
  test("both release and release-id → exit 2, mutually_exclusive_options", () => {
    expect(() =>
      parseCliReleaseFlags({ release: "v1", releaseId: "5" }),
    ).toThrow(
      expect.objectContaining({
        exitCode: 2,
        details: expect.objectContaining({ code: CLI_ERR.mutuallyExclusiveOptions }),
      }),
    );
  });

  test("--release none → mode null", () => {
    expect(parseCliReleaseFlags({ release: "none" })).toEqual({ mode: "null" });
    expect(parseCliReleaseFlags({ release: "NONE" })).toEqual({ mode: "null" });
  });

  test("--release v1 → mode name", () => {
    expect(parseCliReleaseFlags({ release: "v1" })).toEqual({
      mode: "name",
      name: "v1",
    });
  });

  test("--release-id 5 → mode id", () => {
    expect(parseCliReleaseFlags({ releaseId: "5" })).toEqual({ mode: "id", id: 5 });
  });

  test("--release-id abc → exit 2, invalid_value", () => {
    expect(() => parseCliReleaseFlags({ releaseId: "abc" })).toThrow(
      expect.objectContaining({
        exitCode: 2,
        details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
      }),
    );
  });

  test("neither flag → omit", () => {
    expect(parseCliReleaseFlags({})).toEqual({ mode: "omit" });
  });
});

describe("resolveCliReleaseToApiValue", () => {
  test("mode name, release found → returns releaseId", async () => {
    const board: Partial<Board> = {
      releases: [
        { releaseId: 42, name: "v1", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    const ctx = {
      fetchApi: async () => board as Board,
    };
    const id = await resolveCliReleaseToApiValue(
      ctx,
      "my-board",
      { mode: "name", name: "v1" },
      3002,
    );
    expect(id).toBe(42);
  });

  test("mode name, not found → exit 2, release_not_found_by_name", async () => {
    const board: Partial<Board> = {
      releases: [{ releaseId: 1, name: "other", createdAt: "2026-01-01T00:00:00.000Z" }],
    };
    const ctx = {
      fetchApi: async () => board as Board,
    };
    await expect(
      resolveCliReleaseToApiValue(
        ctx,
        "b",
        { mode: "name", name: "missing" },
        undefined,
      ),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: expect.objectContaining({ code: CLI_ERR.releaseNotFoundByName }),
    });
  });
});

describe("resolveExclusiveTextInput", () => {
  test("flag + file → conflicting_input_sources", () => {
    expect(() =>
      resolveExclusiveTextInput("body", {
        text: "inline",
        file: "/tmp/x.txt",
      }),
    ).toThrow(
      expect.objectContaining({
        exitCode: 2,
        details: expect.objectContaining({ code: CLI_ERR.conflictingInputSources }),
      }),
    );
  });

  test("flag only → source flag", () => {
    expect(resolveExclusiveTextInput("body", { text: "hello" })).toEqual({
      source: "flag",
      text: "hello",
    });
  });

  test("none → undefined", () => {
    expect(resolveExclusiveTextInput("body", {})).toBeUndefined();
  });
});

describe("parsePositiveInt", () => {
  test("valid string → number", () => {
    expect(parsePositiveInt("n", "5")).toBe(5);
  });

  test("zero → exit 2, invalid_value", () => {
    expect(() => parsePositiveInt("n", "0")).toThrow(
      expect.objectContaining({
        exitCode: 2,
        details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
      }),
    );
  });

  test("non-integer → exit 2, invalid_value", () => {
    expect(() => parsePositiveInt("n", "1.5")).toThrow(
      expect.objectContaining({
        exitCode: 2,
        details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
      }),
    );
  });
});

describe("parseTaskId", () => {
  test("valid → number", () => {
    expect(parseTaskId("99")).toBe(99);
  });

  test("invalid → exit 2", () => {
    expect(() => parseTaskId("bad")).toThrow(
      expect.objectContaining({
        exitCode: 2,
        details: expect.objectContaining({ code: CLI_ERR.invalidValue }),
      }),
    );
  });
});
