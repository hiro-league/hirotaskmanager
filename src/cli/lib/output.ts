import type { SearchHit } from "../../shared/models";

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
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function truncateCell(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Fixed-width rows for terminal use (`hirotm search --format table`). */
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

export function printError(
  message: string,
  exitCode = 1,
  details?: Record<string, unknown>,
): never {
  process.stderr.write(
    `${JSON.stringify({ error: message, ...details }, null, 2)}\n`,
  );
  process.exit(exitCode);
}

export function exitWithError(error: unknown): never {
  if (error instanceof CliError) {
    printError(error.message, error.exitCode, error.details);
  }

  if (error instanceof Error) {
    printError(error.message, 1);
  }

  printError("Unknown CLI error", 1);
}
