import { Command } from "commander";
import { CLI_DEFAULTS } from "./constants";
import { CLI_ERR } from "../types/errors";
import { getCliOutputFormat, getCliQuiet } from "./cliFormat";
import { CliError, exitWithError } from "./output";

/** Shared Commander option helpers — Phase 1 CLI split from monolithic index.ts. */

/** Help text for read/list `--fields` (subset projection; see `jsonFieldProjection.ts` allowlists). */
export const CLI_FIELDS_OPTION_DESC =
  "Comma-separated API keys per row (unknown keys exit 2); use with global --format ndjson, not human tables.";

/** `boards describe --entities`: list,group,priority,release,status,meta — order controls CLI stdout (and HTTP when subset). */
export const CLI_BOARD_DESCRIBE_ENTITIES_DESC =
  "Comma-separated: list,group,priority,release,status,meta (omit for default five sections, no meta). Board + cliPolicy always in JSON; duplicate or unknown tokens exit 2; board is not a token.";

/** Guarded deletes / structure replaces: paired with `confirmMutableAction` in handlers. */
export const CLI_YES_OPTION_DESC = "Skip the confirmation prompt";

/** Attach `-y` / `--yes` for commands that call `confirmMutableAction`. */
export function addYesOption(command: Command): Command {
  return command.option("-y, --yes", CLI_YES_OPTION_DESC);
}

/** Human tables cannot apply arbitrary `--fields`; enforce before fetch. */
export function requireNdjsonWhenUsingFields(
  fieldKeys: string[] | undefined,
): void {
  if (
    fieldKeys != null &&
    fieldKeys.length > 0 &&
    getCliOutputFormat() === "human"
  ) {
    throw new CliError("--fields requires global --format ndjson", 2, {
      code: CLI_ERR.invalidValue,
    });
  }
}

/** Pipe-friendly `--quiet` stdout is not JSON; same constraint as `--fields` vs human tables. */
export function requireNdjsonWhenQuiet(): void {
  if (getCliQuiet() && getCliOutputFormat() === "human") {
    throw new CliError("--quiet requires global --format ndjson", 2, {
      code: CLI_ERR.invalidValue,
    });
  }
}

/**
 * With global `--quiet`, `--fields` may supply exactly one key (that column per line).
 * Multiple keys are ambiguous for single-column output.
 */
export function resolveQuietExplicitField(
  fieldKeys: string[] | undefined,
): string | undefined {
  if (!getCliQuiet() || fieldKeys == null || fieldKeys.length === 0) {
    return undefined;
  }
  if (fieldKeys.length > 1) {
    throw new CliError("--quiet allows at most one --fields key", 2, {
      code: CLI_ERR.invalidValue,
    });
  }
  return fieldKeys[0];
}

/** Attach `--client-name` for commands that call the HTTP API (mutations send the label). */
export function addClientNameOption(command: Command): Command {
  return command.option(
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

/** Search: default and cap from `CLI_DEFAULTS` (same max as optional list page-all). */
export function parseLimitOption(limit: string | undefined): number {
  if (limit == null || limit === "") return CLI_DEFAULTS.DEFAULT_SEARCH_LIMIT;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError("Invalid limit", 2, { code: CLI_ERR.invalidValue, limit });
  }
  return Math.min(CLI_DEFAULTS.MAX_PAGE_LIMIT, n);
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
  return Math.min(CLI_DEFAULTS.MAX_PAGE_LIMIT, n);
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

/**
 * Commander `.action()` helper: runs the handler inside {@link withCliErrors} so
 * subcommands cannot forget the shared exit path (see cli-architecture-review item 14).
 */
export function cliAction<A extends unknown[]>(
  fn: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  return (...args: A) => withCliErrors(() => fn(...args));
}
