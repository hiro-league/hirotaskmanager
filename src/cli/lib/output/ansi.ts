/**
 * Optional ANSI for human-mode stdout and stderr (`humanText`).
 * Off when not a TTY, `NO_COLOR` is set, `TERM=dumb`, or `--no-color` (cli guidelines).
 */
let cliColorDisabledByFlag = false;

export function resetCliAnsi(): void {
  cliColorDisabledByFlag = false;
}

/** Commander maps `--no-color` to `opts.color === false`. */
export function syncCliAnsiFromGlobals(opts: { color?: boolean }): void {
  cliColorDisabledByFlag = opts.color === false;
}

function useAnsi(): boolean {
  if (cliColorDisabledByFlag) return false;
  if (typeof process === "undefined") return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === "dumb") return false;
  return (
    process.stdout.isTTY === true || process.stderr.isTTY === true
  );
}

/** Dynamic getters so `--no-color` applies after Commander parse (not only at import time). */
export const ansi = {
  get dim(): string {
    return useAnsi() ? "\x1b[2m" : "";
  },
  get bold(): string {
    return useAnsi() ? "\x1b[1m" : "";
  },
  get red(): string {
    return useAnsi() ? "\x1b[31m" : "";
  },
  get reset(): string {
    return useAnsi() ? "\x1b[0m" : "";
  },
};
