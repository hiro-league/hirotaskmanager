import { describe, expect, test } from "bun:test";
import { CLI_ERR } from "../types/errors";
import { enrichNotFoundError, mapHttpStatusToCliFailure } from "./cli-http-errors";
import { CliError } from "./output";

describe("mapHttpStatusToCliFailure", () => {
  test.each([
    [400, CLI_ERR.badRequest, 9, undefined],
    [401, CLI_ERR.unauthenticated, 10, undefined],
    [403, CLI_ERR.forbidden, 4, undefined],
    [404, CLI_ERR.notFound, 3, undefined],
    [408, CLI_ERR.requestTimeout, 7, true],
    [409, CLI_ERR.conflict, 5, undefined],
    [422, CLI_ERR.badRequest, 9, undefined],
    [426, CLI_ERR.versionMismatch, 8, undefined],
    [429, CLI_ERR.rateLimited, 1, true],
    [502, CLI_ERR.internalError, 1, true],
    [418, CLI_ERR.httpError, 1, undefined],
  ] as const)(
    "status %i → code %s exit %i retryable %j",
    (status, code, exit, retryable) => {
      const { exitCode, details } = mapHttpStatusToCliFailure(status, {
        status,
        url: "http://127.0.0.1:1/api/x",
      });
      expect(exitCode).toBe(exit);
      expect(details.code).toBe(code);
      if (retryable === undefined) {
        expect(details.retryable).toBeUndefined();
      } else {
        expect(details.retryable).toBe(retryable);
      }
    },
  );

  test("599 maps to internal_error (5xx branch)", () => {
    const { exitCode, details } = mapHttpStatusToCliFailure(599, { status: 599 });
    expect(exitCode).toBe(1);
    expect(details.code).toBe(CLI_ERR.internalError);
    expect(details.retryable).toBe(true);
  });

  test("preserves API code as serverCode, not duplicate top-level code", () => {
    const { details } = mapHttpStatusToCliFailure(400, {
      code: "CUSTOM",
      status: 400,
    });
    expect(details.code).toBe(CLI_ERR.badRequest);
    expect(details.serverCode).toBe("CUSTOM");
    expect((details as Record<string, unknown>).code).toBe(CLI_ERR.badRequest);
  });

  test("non-string code in body is ignored for serverCode", () => {
    const { details } = mapHttpStatusToCliFailure(404, {
      code: 123,
      status: 404,
    } as Record<string, unknown>);
    expect(details.serverCode).toBeUndefined();
  });
});

describe("enrichNotFoundError", () => {
  test("merges context when details.code is not_found", () => {
    const err = new CliError("Whatever", 3, { code: CLI_ERR.notFound });
    try {
      enrichNotFoundError(err, { board: "my-board", taskId: 9 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      const c = e as CliError;
      expect(c.message).toBe("Whatever");
      expect(c.exitCode).toBe(3);
      expect(c.details).toMatchObject({
        code: CLI_ERR.notFound,
        board: "my-board",
        taskId: 9,
      });
    }
  });

  test("rethrows unchanged when code is not not_found", () => {
    const err = new CliError("Nope", 4, { code: CLI_ERR.forbidden });
    expect(() => enrichNotFoundError(err, { board: "x" })).toThrow(err);
  });
});
