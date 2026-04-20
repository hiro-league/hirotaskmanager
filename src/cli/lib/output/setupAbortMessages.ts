/**
 * Single source of wording for the two-stage Ctrl+C flow during setup.
 *
 * Kept separate from launcherUi.ts so the warning/final lines and their
 * colour treatment can be reviewed and tested independently of the rest of
 * the launcher UI surface.
 */

import {
  describeSetupAbort,
  SETUP_ABORT_FALLBACK_MESSAGE,
  type SetupProgressSnapshot,
} from "../../bootstrap/setupProgress";
import { ansi, paint } from "../../../shared/terminalColors";

export interface AbortPrintTarget {
  isTTY?: boolean;
  write(chunk: string): boolean;
}

const FIRST_PRESS_HEADER =
  "Ctrl+C received. Press Ctrl+C again within 5 seconds to abort setup.";

/**
 * Print the first-press preview: header + "what's done" + "what's not done"
 * + a hint that the user can keep typing to resume their current prompt.
 *
 * Writes to stdout via `target` (defaults to process.stdout) so tests can
 * substitute a buffer. Always begins with a newline so the warning visually
 * separates from any half-typed prompt answer.
 */
export function printSetupAbortPreview(
  snapshot: SetupProgressSnapshot,
  target: AbortPrintTarget = process.stdout,
): void {
  const writeLine = (text: string): void => {
    target.write(`${text}\n`);
  };

  target.write("\n");
  writeLine(paint(target, FIRST_PRESS_HEADER, ansi.bold + ansi.yellow));

  const { done, notDone } = describeSetupAbort(snapshot);

  if (done.length === 0 && notDone.length === 0) {
    // Nothing has happened yet (e.g. interrupt at the very first prompt).
    writeLine(paint(target, SETUP_ABORT_FALLBACK_MESSAGE, ansi.dim));
  } else {
    if (done.length > 0) {
      writeLine(paint(target, "Already done:", ansi.bold));
      for (const item of done) {
        writeLine(`  - ${item}`);
      }
    }
    if (notDone.length > 0) {
      writeLine(paint(target, "Not done yet:", ansi.bold));
      for (const item of notDone) {
        writeLine(`  - ${item}`);
      }
    }
  }

  if (snapshot.currentPromptLabel) {
    writeLine(
      paint(
        target,
        `(Waiting on: ${snapshot.currentPromptLabel}. ` +
          "Type your answer to resume, or press Ctrl+C again to abort.)",
        ansi.dim,
      ),
    );
  } else {
    writeLine(
      paint(
        target,
        "(Press Enter to resume, or press Ctrl+C again to abort.)",
        ansi.dim,
      ),
    );
  }
  target.write("\n");
}

/**
 * Print the final acknowledgment line on the second press, immediately
 * before the process exits with code 130. Mirrors the preview's "the server
 * keeps running" caveat when the operator interrupted the recovery-key step.
 */
export function printSetupAbortFinal(
  snapshot: SetupProgressSnapshot,
  target: AbortPrintTarget = process.stdout,
): void {
  const writeLine = (text: string): void => {
    target.write(`${text}\n`);
  };

  target.write("\n");
  if (snapshot.phases.has("awaiting_recovery_key")) {
    const tail = snapshot.serverUrl
      ? ` Server keeps running at ${snapshot.serverUrl}.`
      : " Server keeps running.";
    writeLine(paint(target, `Launcher closed.${tail}`, ansi.bold + ansi.yellow));
  } else {
    writeLine(paint(target, "Setup aborted.", ansi.bold + ansi.yellow));
  }
}
