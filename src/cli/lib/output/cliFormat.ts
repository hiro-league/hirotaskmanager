/**
 * Global `--format ndjson|human` is the main stdout/stderr shaping switch (see `program.ts` preAction).
 */

import type { CliOutputFormat } from "../../types/output";
import { resetCliAnsi } from "./ansi";

export type { CliOutputFormat } from "../../types/output";

let cliOutputFormat: CliOutputFormat = "ndjson";
let cliQuiet = false;

/** Reset before each CLI parse so tests and long-lived processes do not leak state. */
export function resetCliOutputFormat(): void {
  cliOutputFormat = "ndjson";
  cliQuiet = false;
  resetCliAnsi();
}

/** Commander `preAction` wires global `--format` and `--quiet` here. */
export function syncCliOutputFormatFromGlobals(opts: {
  format?: string;
  quiet?: boolean;
}): void {
  const f = opts.format?.toLowerCase();
  if (f === "human" || f === "ndjson") {
    cliOutputFormat = f;
  }
  cliQuiet = opts.quiet === true;
}

export function getCliOutputFormat(): CliOutputFormat {
  return cliOutputFormat;
}

/** Global `-q` / `--quiet`: list reads print one field per line (see `output.ts`). */
export function getCliQuiet(): boolean {
  return cliQuiet;
}
