/**
 * Central HTTP status → process exit code and stderr `code` for hirotm.
 * Contract: docs/cli-error-handling.md
 */

import { CLI_ERR, CliError } from "../../types/errors";

/**
 * Re-throws HTTP 404 mapped to `not_found` with extra CLI context (board ref, entity ids).
 * Uses stable `details.code` instead of matching `message` (API wording can change).
 */
export function enrichNotFoundError(
  error: unknown,
  context: Record<string, unknown>,
): never {
  if (error instanceof CliError && error.details?.code === CLI_ERR.notFound) {
    throw new CliError(error.message, error.exitCode, {
      ...error.details,
      ...context,
    });
  }
  throw error;
}

export function mapHttpStatusToCliFailure(
  status: number,
  details: Record<string, unknown>,
): { exitCode: number; details: Record<string, unknown> } {
  const serverCode =
    typeof details.code === "string" ? details.code : undefined;
  const { code: _drop, ...rest } = details;
  const base: Record<string, unknown> = {
    ...rest,
    ...(serverCode !== undefined ? { serverCode } : {}),
  };

  switch (status) {
    case 400:
      return { exitCode: 9, details: { ...base, code: CLI_ERR.badRequest } };
    case 401:
      return {
        exitCode: 10,
        details: { ...base, code: CLI_ERR.unauthenticated },
      };
    case 403:
      return { exitCode: 4, details: { ...base, code: CLI_ERR.forbidden } };
    case 404:
      return { exitCode: 3, details: { ...base, code: CLI_ERR.notFound } };
    case 408:
      return {
        exitCode: 7,
        details: {
          ...base,
          code: CLI_ERR.requestTimeout,
          retryable: true,
        },
      };
    case 409:
      return { exitCode: 5, details: { ...base, code: CLI_ERR.conflict } };
    case 422:
      return { exitCode: 9, details: { ...base, code: CLI_ERR.badRequest } };
    case 426:
      return {
        exitCode: 8,
        details: { ...base, code: CLI_ERR.versionMismatch },
      };
    case 429:
      return {
        exitCode: 1,
        details: {
          ...base,
          code: CLI_ERR.rateLimited,
          retryable: true,
        },
      };
    default:
      if (status >= 500 && status < 600) {
        return {
          exitCode: 1,
          details: {
            ...base,
            code: CLI_ERR.internalError,
            retryable: true,
          },
        };
      }
      return {
        exitCode: 1,
        details: { ...base, code: CLI_ERR.httpError },
      };
  }
}
