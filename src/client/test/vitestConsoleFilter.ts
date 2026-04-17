/**
 * Used by `vitest.config.ts` `onConsoleLog` to keep client test output readable: expected
 * error-boundary and suspense tests trigger React dev-mode stderr that looks like failures
 * but is normal. Unmatched logs still print so real problems remain obvious.
 *
 * @returns `true` to print the log, `false` to suppress (Vitest contract).
 */
export function vitestClientShouldLogConsole(
  log: string,
  type: "stdout" | "stderr",
): boolean {
  if (type !== "stderr") return true;

  // React 18/19: repeated paragraphs after a caught render error (noise next to real stack).
  if (log.includes("The above error occurred in the")) return false;
  if (log.includes("React will try to recreate this component tree")) return false;
  if (log.includes("Consider adding an error boundary")) return false;

  return true;
}
