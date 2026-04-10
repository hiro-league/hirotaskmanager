import type { SearchHit } from "../../shared/models";
import { CLI_ERR } from "./cli-error-codes";

/**
 * Default JSON is compact (single line) for agents and pipes; global `--pretty` opts into indented output.
 * No env var for format — only the CLI flag (see AGENTS.md).
 */
let usePrettyCliJson = false;

/** Reset before each CLI parse so a long-lived test process does not leak the prior run’s format. */
export function resetCliJsonFormatForRun(): void {
  usePrettyCliJson = false;
}

/** Apply global `--pretty`. Called from Commander `preAction`. */
export function syncCliJsonFormatFromGlobals(globalOpts: {
  pretty?: boolean;
}): void {
  usePrettyCliJson = Boolean(globalOpts.pretty);
}

function stringifyCliJson(data: unknown): string {
  return usePrettyCliJson
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
}

export class CliError extends Error {
  details?: Record<string, unknown>;
  exitCode: number;

  constructor(
    message: string,
    exitCode = 1,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function printJson(data: unknown): void {
  process.stdout.write(`${stringifyCliJson(data)}\n`);
}

function truncateCell(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Fixed-width rows for terminal use (`hirotm query search --format table`). */
export function printSearchTable(hits: SearchHit[]): void {
  if (hits.length === 0) {
    process.stdout.write("No results.\n");
    return;
  }
  const wBoard = 16;
  const wId = 5;
  const wTitle = 26;
  const wSnip = 44;
  const head = `${"Board".padEnd(wBoard)} ${"Id".padStart(wId)} ${"Title".padEnd(wTitle)} Snippet\n`;
  const rule = `${"-".repeat(wBoard)} ${"-".repeat(wId)} ${"-".repeat(wTitle)} ${"-".repeat(wSnip)}\n`;
  process.stdout.write(head);
  process.stdout.write(rule);
  for (const h of hits) {
    const line = `${truncateCell(h.boardSlug, wBoard).padEnd(wBoard)} ${String(h.taskId).padStart(wId)} ${truncateCell(h.title, wTitle).padEnd(wTitle)} ${truncateCell(h.snippet, wSnip)}\n`;
    process.stdout.write(line);
  }
}

/** Pulls `code` / `retryable` to top-level stderr JSON for stable agent parsing (docs/cli-error-handling.md). */
function buildStderrPayload(
  message: string,
  details?: Record<string, unknown>,
): Record<string, unknown> {
  if (!details) {
    return { error: message };
  }
  const { code, retryable, ...rest } = details as Record<string, unknown> & {
    code?: unknown;
    retryable?: unknown;
  };
  const payload: Record<string, unknown> = { error: message };
  if (typeof code === "string") {
    payload.code = code;
  }
  if (typeof retryable === "boolean") {
    payload.retryable = retryable;
  }
  Object.assign(payload, rest);
  return payload;
}

export function printError(
  message: string,
  exitCode = 1,
  details?: Record<string, unknown>,
): never {
  process.stderr.write(
    `${stringifyCliJson(buildStderrPayload(message, details))}\n`,
  );
  process.exit(exitCode);
}

export function exitWithError(error: unknown): never {
  if (error instanceof CliError) {
    printError(error.message, error.exitCode, error.details);
  }

  if (error instanceof Error) {
    printError(error.message, 1, { code: CLI_ERR.internalError });
  }

  printError("Unknown CLI error", 1, { code: CLI_ERR.internalError });
}
