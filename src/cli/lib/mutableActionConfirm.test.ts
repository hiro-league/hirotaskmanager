import { afterEach, describe, expect, test } from "bun:test";
import { CLI_ERR } from "../types/errors";
import { confirmMutableAction } from "./mutableActionConfirm";
import { CliError } from "./output";

describe("confirmMutableAction", () => {
  const origIn = process.stdin.isTTY;
  const origOut = process.stdout.isTTY;

  afterEach(() => {
    Reflect.defineProperty(process.stdin, "isTTY", {
      value: origIn,
      configurable: true,
    });
    Reflect.defineProperty(process.stdout, "isTTY", {
      value: origOut,
      configurable: true,
    });
  });

  test("--yes skips checks", async () => {
    Reflect.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    Reflect.defineProperty(process.stdout, "isTTY", {
      value: false,
      configurable: true,
    });
    await confirmMutableAction({
      yes: true,
      impactLines: ["would do something"],
    });
  });

  test("non-TTY without yes throws confirmation_required", async () => {
    Reflect.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    Reflect.defineProperty(process.stdout, "isTTY", {
      value: false,
      configurable: true,
    });
    let err: unknown;
    try {
      await confirmMutableAction({
        yes: false,
        impactLines: ["line a", "line b"],
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CliError);
    const ce = err as CliError;
    expect(ce.exitCode).toBe(2);
    expect(ce.details?.code).toBe(CLI_ERR.confirmationRequired);
  });

  test("stdinReservedForPayload without yes throws (even if TTY)", async () => {
    Reflect.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    Reflect.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    let err: unknown;
    try {
      await confirmMutableAction({
        yes: false,
        stdinReservedForPayload: true,
        impactLines: ["payload on stdin"],
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).details?.code).toBe(CLI_ERR.confirmationRequired);
  });
});
