/**
 * Prints a "next step" banner after install.
 *
 * npm v7+ runs lifecycle scripts with stdio piped (foreground-scripts=false by
 * default), so console.log / console.error is silently swallowed. We bypass
 * this by writing directly to the terminal device (\\.\CON on Windows, /dev/tty on
 * Unix). Falls back to stderr when no terminal device is available (CI, piped).
 */
import { writeFileSync, openSync, closeSync } from 'node:fs';
import { platform } from 'node:os';

if (process.env.CI === 'true' || process.env.SKIP_TASKMANAGER_POSTINSTALL === '1') {
  process.exit(0);
}

const INNER = 60;
const top    = `  ┌${'─'.repeat(INNER + 2)}┐`;
const bottom = `  └${'─'.repeat(INNER + 2)}┘`;
const row    = (t) => `  │  ${t.padEnd(INNER)}│`;

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
 * Try to write directly to the controlling terminal device, bypassing
 * npm's piped stdio so the message is visible even with foreground-scripts=false.
 */
function writeToTerminal(text) {
  // Use \\.\CON on Windows: bare "CON" is a reserved name and Node can create a
  // regular file named CON in cwd instead of opening the console device.
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

// Primary: write to the terminal device directly (survives npm stdio capture).
// Fallback: stderr (works when foreground-scripts=true or run manually).
if (!writeToTerminal(banner)) {
  console.error(banner);
}
