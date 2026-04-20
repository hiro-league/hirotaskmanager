import type { PaginatedListBody } from "../../../shared/pagination";
import { CLI_ERR, CliError } from "../../types/errors";
import type { QuietListPlan, TableColumn } from "../../types/output";
import { ansi } from "./ansi";
import { getCliOutputFormat, getCliQuiet } from "./cliFormat";
import { writeHumanStderrError, writeHumanStdoutObject } from "./humanText";
import { renderRecordsTable } from "./textTable";

export { resetCliOutputFormat, syncCliOutputFormatFromGlobals } from "./cliFormat";
export { CliError };
export type { QuietListPlan };

/** Single-document success (writes, `releases show`, server status, …). `boards describe` uses `printBoardDescribeResponse(body, parsed)` (multi-line ndjson or human tables). */
export function printJson(data: unknown): void {
  if (getCliOutputFormat() === "ndjson") {
    process.stdout.write(`${JSON.stringify(data)}\n`);
  } else {
    writeHumanStdoutObject(data);
  }
}

/** Machine-oriented list rows: one JSON object per line. */
export function printNdjsonLines(items: readonly unknown[] | undefined): void {
  const rows = items ?? [];
  for (const item of rows) {
    process.stdout.write(`${JSON.stringify(item)}\n`);
  }
}

function formatQuietCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** One line per item; not JSON (for pipes / xargs). */
export function printQuietListLines(
  items: readonly unknown[],
  plan: QuietListPlan,
): void {
  for (const item of items) {
    const row = item as Record<string, unknown>;
    let line: string;
    if (plan.explicitField) {
      line = formatQuietCell(row[plan.explicitField]);
    } else {
      line = "";
      for (const key of plan.defaultKeys) {
        const v = row[key];
        if (v === null || v === undefined) {
          continue;
        }
        if (typeof v === "string" && v.trim() === "") {
          continue;
        }
        line = formatQuietCell(v);
        break;
      }
    }
    process.stdout.write(`${line}\n`);
  }
}

/** Single total for `--count-only` list/search reads. */
export function printCountOnly(total: number): void {
  if (getCliQuiet()) {
    process.stdout.write(`${total}\n`);
    return;
  }
  if (getCliOutputFormat() === "ndjson") {
    process.stdout.write(`${JSON.stringify({ count: total })}\n`);
    return;
  }
  process.stdout.write(`count ${total}\n`);
}

/** Optional context for the empty-result branch (clig.dev: data → stdout, messaging → stderr). */
export type EmptyListMessages = {
  /** Human-mode stdout replacement for the generic "No rows." line. */
  emptyMessage?: string;
  /** TTY-only, non-quiet stderr hint with a recovery suggestion. */
  emptyHint?: string;
};

/**
 * `total === 0` branch shared by paginated list reads.
 * - ndjson stdout: silent (preserves NDJSON one-object-per-line contract).
 * - human stdout: `emptyMessage` (default `No rows.`) + paging footer.
 * - --quiet: silent on both streams.
 * - stderr: write `emptyHint` only when stderr is a TTY (avoids polluting captured logs).
 */
function emitEmptyListResult<T>(
  body: PaginatedListBody<T>,
  empty: EmptyListMessages,
): void {
  const quiet = getCliQuiet();
  if (!quiet && getCliOutputFormat() === "human") {
    const message = empty.emptyMessage ?? "No rows.";
    const footer = `total ${body.total} · showing 0 · limit ${body.limit} · offset ${body.offset}`;
    process.stdout.write(`${message}\n${footer}\n`);
  }
  // ndjson stdout intentionally silent: empty stream is the valid encoding for "no items".
  if (!quiet && empty.emptyHint && process.stderr.isTTY === true) {
    process.stderr.write(`${ansi.dim}hint:${ansi.reset} ${empty.emptyHint}\n`);
  }
}

/** Paginated list read: NDJSON lines, `--quiet` lines, or fixed-width table + paging footer. */
export function printPaginatedListRead<T>(
  body: PaginatedListBody<T>,
  displayItems: readonly unknown[],
  columns: readonly TableColumn[],
  quietPlan: QuietListPlan,
  empty: EmptyListMessages = {},
): void {
  if (displayItems.length === 0 && body.total === 0) {
    emitEmptyListResult(body, empty);
    return;
  }
  // Global `--quiet` overrides ndjson/human for list stdout (plain lines, not JSON or tables).
  if (getCliQuiet()) {
    printQuietListLines(displayItems, quietPlan);
    return;
  }
  if (getCliOutputFormat() === "ndjson") {
    printNdjsonLines(displayItems);
    return;
  }
  const records = displayItems.map((r) => r as Record<string, unknown>);
  const footer = [
    `total ${body.total} · showing ${records.length} · limit ${body.limit} · offset ${body.offset}`,
  ];
  process.stdout.write(renderRecordsTable(records, columns, footer));
}

/** Array list read (`statuses list`): NDJSON lines, `--quiet` lines, or table (no envelope). */
export function printArrayListRead(
  displayItems: readonly unknown[],
  columns: readonly TableColumn[],
  quietPlan: QuietListPlan,
): void {
  if (getCliQuiet()) {
    printQuietListLines(displayItems, quietPlan);
    return;
  }
  if (getCliOutputFormat() === "ndjson") {
    printNdjsonLines(displayItems);
    return;
  }
  const records = displayItems.map((r) => r as Record<string, unknown>);
  const footer = [`count ${records.length}`];
  process.stdout.write(renderRecordsTable(records, columns, footer));
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
  const payload = buildStderrPayload(message, details);
  if (getCliOutputFormat() === "ndjson") {
    process.stderr.write(`${JSON.stringify(payload)}\n`);
  } else {
    const { error, ...rest } = payload;
    writeHumanStderrError(
      String(error ?? message),
      rest as Record<string, unknown>,
    );
  }
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
