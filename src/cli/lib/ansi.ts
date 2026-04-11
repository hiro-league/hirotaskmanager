/** Respect NO_COLOR; use TTY hint for optional styling (stdout or stderr). */
const enabled =
  (typeof process !== "undefined" &&
    (process.stdout.isTTY === true || process.stderr.isTTY === true) &&
    !process.env.NO_COLOR) === true;

export const ansi = {
  dim: enabled ? "\x1b[2m" : "",
  bold: enabled ? "\x1b[1m" : "",
  red: enabled ? "\x1b[31m" : "",
  reset: enabled ? "\x1b[0m" : "",
};
