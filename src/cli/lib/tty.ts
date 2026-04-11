/**
 * Shared TTY detection for interactive prompts (launcher first-run setup and
 * mutable-action confirmation). Keeps behavior in one place (see cli-architecture-review #13).
 */
export function canPromptInteractively(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
