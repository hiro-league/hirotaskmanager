/**
 * Aspect 3 — stderr JSON shape and exit paths for agents (`docs/cli-error-handling.md`).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { CLI_ERR } from "./cli-error-codes";
import {
  CliError,
  exitWithError,
  printError,
  printJson,
  resetCliJsonFormatForRun,
  syncCliJsonFormatFromGlobals,
} from "./output";

describe("printError / stderr JSON (aspect 3)", () => {
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;

  afterEach(() => {
    // Restore so other tests see the real streams.
    process.stderr.write = origStderrWrite;
    process.exit = origExit;
    resetCliJsonFormatForRun();
  });

  function capturePrintError(
    fn: () => void,
  ): { exitCode: number; stderrJson: Record<string, unknown> } {
    let stderrOut = "";
    let exitCode = -1;
    process.stderr.write = (
      chunk: string | Uint8Array,
      ...args: unknown[]
    ): boolean => {
      stderrOut +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      void args;
      return true;
    };
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error("__test_exit__");
    }) as typeof process.exit;

    try {
      fn();
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toBe("__test_exit__");
    }

    const stderrJson = JSON.parse(stderrOut.trim()) as Record<string, unknown>;
    return { exitCode, stderrJson };
  }

  test("payload without details is only error string", () => {
    const { exitCode, stderrJson } = capturePrintError(() =>
      printError("Plain failure", 1),
    );
    expect(exitCode).toBe(1);
    expect(stderrJson).toEqual({ error: "Plain failure" });
  });

  test("hoists code and retryable to top level and merges other detail fields", () => {
    const { exitCode, stderrJson } = capturePrintError(() =>
      printError("Denied", 4, {
        code: CLI_ERR.forbidden,
        retryable: false,
        hint: "fix policy",
      }),
    );
    expect(exitCode).toBe(4);
    expect(stderrJson).toMatchObject({
      error: "Denied",
      code: CLI_ERR.forbidden,
      retryable: false,
      hint: "fix policy",
    });
  });

  test("omits code/retryable when not string/boolean", () => {
    const { stderrJson } = capturePrintError(() =>
      printError("x", 1, {
        code: 404 as unknown as string,
        retryable: "no" as unknown as boolean,
        other: 1,
      }),
    );
    expect(stderrJson.error).toBe("x");
    expect(stderrJson.code).toBeUndefined();
    expect(stderrJson.retryable).toBeUndefined();
    expect(stderrJson.other).toBe(1);
  });

  test("default stderr JSON is single-line (compact)", () => {
    let stderrOut = "";
    let exitCode = -1;
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      stderrOut +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      return true;
    };
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error("__test_exit__");
    }) as typeof process.exit;

    try {
      printError("e", 3, { code: CLI_ERR.notFound, hint: "x" });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toBe("__test_exit__");
    }
    expect(exitCode).toBe(3);
    expect(stderrOut.trim().split("\n").length).toBe(1);
    expect(JSON.parse(stderrOut.trim())).toMatchObject({
      error: "e",
      code: CLI_ERR.notFound,
    });
  });

  test("pretty mode emits multi-line stderr JSON", () => {
    let stderrOut = "";
    let exitCode = -1;
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      stderrOut +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      return true;
    };
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error("__test_exit__");
    }) as typeof process.exit;

    syncCliJsonFormatFromGlobals({ pretty: true });
    try {
      printError("e", 3, { code: CLI_ERR.notFound });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toBe("__test_exit__");
    }
    expect(exitCode).toBe(3);
    expect(stderrOut.trim().split("\n").length).toBeGreaterThan(1);
    expect(JSON.parse(stderrOut.trim())).toMatchObject({
      error: "e",
      code: CLI_ERR.notFound,
    });
  });
});

describe("exitWithError (aspect 3)", () => {
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;

  afterEach(() => {
    process.stderr.write = origStderrWrite;
    process.exit = origExit;
    resetCliJsonFormatForRun();
  });

  function captureExitWithError(err: unknown): {
    exitCode: number;
    stderrJson: Record<string, unknown>;
  } {
    let stderrOut = "";
    let exitCode = -1;
    process.stderr.write = (
      chunk: string | Uint8Array,
      ...args: unknown[]
    ): boolean => {
      stderrOut +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      // Capture only; avoid writing test JSON to the real stderr stream.
      void args;
      return true;
    };
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error("__test_exit__");
    }) as typeof process.exit;

    try {
      exitWithError(err);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toBe("__test_exit__");
    }

    return {
      exitCode,
      stderrJson: JSON.parse(stderrOut.trim()) as Record<string, unknown>,
    };
  }

  test("CliError preserves message, exitCode, and details.code", () => {
    const { exitCode, stderrJson } = captureExitWithError(
      new CliError("Query required", 2, { code: CLI_ERR.missingRequired }),
    );
    expect(exitCode).toBe(2);
    expect(stderrJson).toMatchObject({
      error: "Query required",
      code: CLI_ERR.missingRequired,
    });
  });

  test("generic Error maps to exit 1 and internal_error", () => {
    const { exitCode, stderrJson } = captureExitWithError(
      new Error("unexpected"),
    );
    expect(exitCode).toBe(1);
    expect(stderrJson).toMatchObject({
      error: "unexpected",
      code: CLI_ERR.internalError,
    });
  });

  test("non-Error unknown maps to internal_error message", () => {
    const { exitCode, stderrJson } = captureExitWithError("string-throw");
    expect(exitCode).toBe(1);
    expect(stderrJson).toMatchObject({
      error: "Unknown CLI error",
      code: CLI_ERR.internalError,
    });
  });
});

describe("printJson / default compact vs --pretty (#4)", () => {
  const origStdoutWrite = process.stdout.write.bind(process.stdout);

  afterEach(() => {
    process.stdout.write = origStdoutWrite;
    resetCliJsonFormatForRun();
  });

  test("default is compact (single line for nested object)", () => {
    let out = "";
    process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      out +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      void args;
      return true;
    };
    printJson({ board: { id: 1 } });
    expect(out.trimEnd().split("\n").length).toBe(1);
    expect(JSON.parse(out.trim())).toEqual({ board: { id: 1 } });
  });

  test("syncCliJsonFormatFromGlobals({ pretty: true }) prints indented JSON", () => {
    let out = "";
    process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      out +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      void args;
      return true;
    };
    syncCliJsonFormatFromGlobals({ pretty: true });
    printJson({ board: { id: 1 } });
    expect(out.trim().split("\n").length).toBeGreaterThan(1);
    expect(JSON.parse(out.trim())).toEqual({ board: { id: 1 } });
  });
});
