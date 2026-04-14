/**
 * Prints a "next step" banner after install.
 *
 * npm v7+ runs lifecycle scripts with stdio piped (foreground-scripts=false by
 * default), so console.log / console.error is silently swallowed. We bypass
 * this by writing directly to the terminal device:
 *   - Windows: \\.\CON  (UNC device path — avoids the ghost-file issue that
 *     bare "CON" causes with git/Cursor on Windows)
 *   - Unix:    /dev/tty
 * Falls back to stderr when no terminal device is available (CI, piped).
 *
 * Border uses ASCII (+ - |) only: cmd.exe often uses a legacy code page, so
 * UTF-8 box-drawing characters would render as mojibake (e.g. Γöî).
 */
import { writeFileSync, openSync, closeSync } from 'node:fs';
import { platform } from 'node:os';

if (process.env.CI === 'true' || process.env.SKIP_TASKMANAGER_POSTINSTALL === '1') {
  process.exit(0);
}

const INNER = 60;
const top = `  +${'-'.repeat(INNER + 2)}+`;
const bottom = `  +${'-'.repeat(INNER + 2)}+`;
const row = (t) => `  |  ${t.padEnd(INNER)}|`;

const banner = [
  '',
  top,
  row('@hiroleague/taskmanager installed'),
  row(''),
  row('To finish setup and start the server, run:'),
  row(''),
  row('  hirotaskmanager'),
  row(''),
  row('CLI shorthand (boards, tasks, search):'),
  row(''),
  row('  hirotm --help'),
  bottom,
  '',
].join('\n');

/**
 * Write directly to the controlling terminal device, bypassing npm's piped
 * stdio so the message is visible even with foreground-scripts=false.
 * Uses the UNC device path \\.\CON on Windows (not bare "CON") to avoid
 * creating a ghost file entry that confuses git and Cursor.
 */
function writeToTerminal(text) {
  const device = platform() === 'win32' ? '\\\\.\\CON' : '/dev/tty';
  try {
    const fd = openSync(device, 'w');
    try {
      writeFileSync(fd, text + '\n');
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}

if (!writeToTerminal(banner)) {
  console.error(banner);
}
