import { Command } from "commander";
import { CLI_ERR } from "./cli-error-codes";
import { CliError, exitWithError } from "./output";

/** Shared Commander option helpers — Phase 1 CLI split from monolithic index.ts. */

/** Help text for read/list `--fields` (subset projection; see `jsonFieldProjection.ts` allowlists). */
export const CLI_FIELDS_OPTION_DESC =
  "Comma-separated JSON keys per row (API names only; unknown keys exit 2). Paginated output keeps total, limit, offset.";

export function addPortOption(command: Command): Command {
  return command
    .option("-p, --port <port>", "Port for the local TaskManager API")
    .option(
      "--client-name <name>",
      "Human-friendly client label sent with API requests (for notifications)",
    );
}

export function addProfileOption(command: Command): Command {
  return command.option(
    "--profile <name>",
    "Runtime profile name for this command",
  );
}

export function parsePortOption(port: string | undefined): number | undefined {
  if (!port?.trim()) return undefined;

  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError("Invalid port", 2, { code: CLI_ERR.invalidValue, port });
  }

  return parsed;
}

export function collectMultiValue(
  value: string,
  previous: string[] = [],
): string[] {
  return [
    ...previous,
    ...value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  ];
}

/** Search: default 20 hits per page, cap 500 (matches `MAX_PAGE_LIMIT`). */
export function parseLimitOption(limit: string | undefined): number {
  if (limit == null || limit === "") return 20;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError("Invalid limit", 2, { code: CLI_ERR.invalidValue, limit });
  }
  return Math.min(500, n);
}

/** Optional list limit for tasks/trash/boards/releases; omit = no `limit` param (one full page). */
export function parseOptionalListLimit(
  limit: string | undefined,
): number | null {
  if (limit == null || limit === "") return null;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError("Invalid limit", 2, { code: CLI_ERR.invalidValue, limit });
  }
  return Math.min(500, n);
}

export function parseOptionalOffset(offset: string | undefined): number {
  if (offset == null || offset === "") return 0;
  const n = Number(offset);
  if (!Number.isInteger(n) || n < 0) {
    throw new CliError("Invalid offset", 2, { code: CLI_ERR.invalidValue, offset });
  }
  return n;
}

/** Wrap handler execution so Commander actions share one exit path (Phase 2). */
export async function withCliErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    exitWithError(error);
  }
}
