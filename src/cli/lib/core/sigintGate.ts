/**
 * Two-stage Ctrl+C controller for `hirotaskmanager` setup mode.
 *
 * CLIG companion §12 ("Signals (Ctrl-C) and interruption") asks for an
 * acknowledged-then-confirmed shutdown. The launcher's previous behaviour
 * during readline-driven prompts was to silently swallow the SIGINT (Node
 * readline auto-installs its own SIGINT listener that emits `'SIGINT'` on
 * the rl interface and, when nothing is bound to it, just returns), which
 * made the launcher hang on the first Ctrl+C and exit with no acknowledgment
 * on the second.
 *
 * The gate replaces that with: first press fires `onFirstPress`, arms a 5s
 * timer; a second press inside the window fires `onSecondPress` and exits
 * 130; if no second press lands, the gate disarms quietly so an idle session
 * does not exit on the next stray Ctrl+C an hour later.
 *
 * The gate must be the single SIGINT sink for the duration of setup. Each
 * readline-using helper must forward its rl `'SIGINT'` into
 * `process.emit('SIGINT')` so the gate sees it; otherwise readline swallows
 * the signal and the gate never fires (see setupWizards.ts prompt helpers
 * and launcher.ts waitForEnterKey).
 *
 * Out of scope: foreground server SIGINT forwarding in process.ts. That path
 * installs/removes its own short-lived SIGINT listener while the child runs
 * and is intentionally untouched here.
 */

import process from "node:process";

export interface SigintGateOptions {
  /** Called when the first SIGINT lands (or the first one after disarm). */
  onFirstPress: () => void;
  /** Called when a second SIGINT lands inside the arm window. */
  onSecondPress: () => void;
  /** Window in which a second press exits. Defaults to 5000ms. */
  resetAfterMs?: number;
  /** Exit code used after onSecondPress. Defaults to 130 (POSIX SIGINT). */
  exitCode?: number;
  /**
   * Hook for tests: skip the actual `process.exit` so assertions can run
   * after onSecondPress. Production never sets this.
   */
  exitFn?: (code: number) => void;
}

export interface SigintGateHandle {
  /**
   * Remove the SIGINT listener and clear any pending arm timer. Idempotent.
   * Must be called from a `finally` block by the caller so the foreground
   * server SIGINT forwarder later in the flow takes over a clean slot.
   */
  dispose(): void;
  /** Visible for tests: whether the next SIGINT will trigger second-press. */
  isArmed(): boolean;
}

const DEFAULT_RESET_MS = 5000;
const DEFAULT_EXIT_CODE = 130;

export function installSigintGate(opts: SigintGateOptions): SigintGateHandle {
  const resetAfterMs = opts.resetAfterMs ?? DEFAULT_RESET_MS;
  const exitCode = opts.exitCode ?? DEFAULT_EXIT_CODE;
  // Default to a never-returning exit in production so callers can rely on
  // onSecondPress -> process termination semantics.
  const exitFn: (code: number) => void =
    opts.exitFn ??
    ((code: number): void => {
      process.exit(code);
    });

  let armed = false;
  let armTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearArmTimer = (): void => {
    if (armTimer) {
      clearTimeout(armTimer);
      armTimer = null;
    }
  };

  const handler = (): void => {
    if (disposed) return;
    if (armed) {
      // Second press inside the window: final acknowledgment + exit.
      armed = false;
      clearArmTimer();
      try {
        opts.onSecondPress();
      } catch {
        // Best-effort message: never block the exit on a printer failure.
      }
      exitFn(exitCode);
      return;
    }

    armed = true;
    try {
      opts.onFirstPress();
    } catch {
      /* swallow — same reasoning as above */
    }
    armTimer = setTimeout(() => {
      armed = false;
      armTimer = null;
    }, resetAfterMs);
    // Allow Node to exit normally if every other handle is gone — we do not
    // want this timer to keep a finished launcher alive.
    if (typeof (armTimer as { unref?: () => void }).unref === "function") {
      (armTimer as { unref: () => void }).unref();
    }
  };

  process.on("SIGINT", handler);

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      process.off("SIGINT", handler);
      clearArmTimer();
      armed = false;
    },
    isArmed(): boolean {
      return armed;
    },
  };
}
