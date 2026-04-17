/**
 * Central HTTP status → process exit code and stderr `code` for hirotm.
 * Contract: docs/cli-error-handling.md
 */

import { CLI_ERR, CliError } from "../../types/errors";

/**
 * Path after `/api` from a request URL (e.g. `/boards/my-slug`).
 * Used to attach contextual recovery hints without per-handler duplication.
 */
export function apiPathFromRequestUrl(url: unknown): string {
  if (typeof url !== "string" || url.length === 0) return "";
  try {
    const pathname = new URL(url).pathname;
    const prefix = "/api";
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      return rest.length > 0 ? rest : "/";
    }
    return pathname;
  } catch {
    return "";
  }
}

/**
 * Recovery `hint` for mapped HTTP failures: generic by status, refined by API path
 * (`/boards/...`, `/tasks/...`, etc.). Does not replace an existing body `hint`.
 */
export function buildHttpFailureHint(status: number, apiPath: string): string {
  const p = apiPath;

  if (status === 404) {
    if (p.startsWith("/boards")) {
      return "No matching board; run `hirotm boards list` or `hirotm boards describe <slug>`.";
    }
    if (p.startsWith("/lists")) {
      return "No matching list; run `hirotm lists list --board <slug>` and confirm list ids.";
    }
    if (p.startsWith("/tasks")) {
      return "No matching task; run `hirotm tasks list --board <slug>` to see task ids.";
    }
    if (p.startsWith("/releases")) {
      return "No matching release; run `hirotm releases list --board <slug>`.";
    }
    if (p.startsWith("/trash")) {
      return "Nothing matched in Trash; run `hirotm trash boards list` / `lists` / `tasks` for trashed ids.";
    }
    if (p.startsWith("/statuses")) {
      return "Run `hirotm statuses list` for valid status ids.";
    }
    if (p.startsWith("/search")) {
      return "Refine the query or board scope; see `hirotm query search --help`.";
    }
    return "Verify the resource id or slug; use the matching `hirotm … list` or `describe` command for valid values.";
  }

  if (status === 400 || status === 422) {
    if (p.startsWith("/boards")) {
      return "Invalid request for boards; check flags, slug, and JSON body (`hirotm boards --help`).";
    }
    if (p.startsWith("/lists")) {
      return "Invalid request for lists; check board, list id, and flags (`hirotm lists --help`).";
    }
    if (p.startsWith("/tasks")) {
      return "Invalid request for tasks; check board, list, ids, and flags (`hirotm tasks --help`).";
    }
    if (p.startsWith("/releases")) {
      return "Invalid request for releases; check board and release fields (`hirotm releases --help`).";
    }
    if (p.startsWith("/trash")) {
      return "Invalid trash request; check ids and subcommand (`hirotm trash --help`).";
    }
    if (p.startsWith("/statuses")) {
      return "Invalid request; check payloads (`hirotm statuses list`).";
    }
    if (p.startsWith("/search")) {
      return "Invalid search request; check query and filters (`hirotm query search --help`).";
    }
    return "Invalid request; check flags and values against the server message above and `hirotm <subcommand> --help`.";
  }

  switch (status) {
    case 401:
      return "Authentication may be required; check API key or access settings for this profile in the web app.";
    case 403:
      return "Check CLI access policy in the Task Manager web app for this client.";
    case 408:
      return "The request timed out; retry or narrow filters / page size.";
    case 409:
      return "Conflict with existing data; resolve (rename, delete the other resource, or refresh) and retry.";
    case 426:
      return "Client and server versions may be incompatible; update hirotm or the Task Manager server.";
    case 429:
      return "Rate limited; wait and retry.";
    default:
      if (status >= 500 && status < 600) {
        return "Server error; retry later or run `hirotm server start --foreground` to inspect logs.";
      }
      return "Unexpected HTTP status; verify URL, port, and `--profile`, then retry.";
  }
}

function mergeHttpFailureHintIfMissing(
  status: number,
  details: Record<string, unknown>,
): Record<string, unknown> {
  const existing = details.hint;
  if (typeof existing === "string" && existing.length > 0) {
    return details;
  }
  const path = apiPathFromRequestUrl(details.url);
  return {
    ...details,
    hint: buildHttpFailureHint(status, path),
  };
}

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

  let result: { exitCode: number; details: Record<string, unknown> };

  switch (status) {
    case 400:
      result = { exitCode: 9, details: { ...base, code: CLI_ERR.badRequest } };
      break;
    case 401:
      result = {
        exitCode: 10,
        details: { ...base, code: CLI_ERR.unauthenticated },
      };
      break;
    case 403:
      result = { exitCode: 4, details: { ...base, code: CLI_ERR.forbidden } };
      break;
    case 404:
      result = { exitCode: 3, details: { ...base, code: CLI_ERR.notFound } };
      break;
    case 408:
      result = {
        exitCode: 7,
        details: {
          ...base,
          code: CLI_ERR.requestTimeout,
          retryable: true,
        },
      };
      break;
    case 409:
      result = { exitCode: 5, details: { ...base, code: CLI_ERR.conflict } };
      break;
    case 422:
      result = { exitCode: 9, details: { ...base, code: CLI_ERR.badRequest } };
      break;
    case 426:
      result = {
        exitCode: 8,
        details: { ...base, code: CLI_ERR.versionMismatch },
      };
      break;
    case 429:
      result = {
        exitCode: 1,
        details: {
          ...base,
          code: CLI_ERR.rateLimited,
          retryable: true,
        },
      };
      break;
    default:
      if (status >= 500 && status < 600) {
        result = {
          exitCode: 1,
          details: {
            ...base,
            code: CLI_ERR.internalError,
            retryable: true,
          },
        };
      } else {
        result = {
          exitCode: 1,
          details: { ...base, code: CLI_ERR.httpError },
        };
      }
  }

  return {
    exitCode: result.exitCode,
    details: mergeHttpFailureHintIfMissing(status, result.details),
  };
}
