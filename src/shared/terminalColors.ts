/** Minimal ANSI styling; respects NO_COLOR and TTY. */

export function colorEnabled(stream: { isTTY?: boolean }): boolean {
  return Boolean(stream.isTTY && process.env.NO_COLOR !== "1");
}

export const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
} as const;

export function paint(
  stream: { isTTY?: boolean },
  text: string,
  code: string,
): string {
  return colorEnabled(stream) ? `${code}${text}${ansi.reset}` : text;
}
