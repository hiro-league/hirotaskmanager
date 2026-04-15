/**
 * Prints a "next step" banner after install and copies bundled skills to the
 * user's Task Manager home so users can install skills from the repo or locally.
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
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  openSync,
  closeSync,
} from 'node:fs';
import { platform, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.CI === 'true' || process.env.SKIP_TASKMANAGER_POSTINSTALL === '1') {
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Skills copy: bundle → user Task Manager home
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');
const bundledSkillsDir = join(packageRoot, 'skills');
const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
const taskManagerHome = join(homeDir, '.taskmanager');
const targetSkillsDir = join(taskManagerHome, 'skills');
const versionStampFile = join(taskManagerHome, '.skills-version');

/** Read the version from the package's own package.json. */
function getPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Copy bundled skills to the user's Task Manager home, replacing stale copies
 * when
 * the package version changes.
 */
function installSkills() {
  if (!existsSync(bundledSkillsDir)) return false;

  const currentVersion = getPackageVersion();
  let existingVersion = '';
  try {
    existingVersion = readFileSync(versionStampFile, 'utf8').trim();
  } catch { /* missing or unreadable — treat as stale */ }

  if (existingVersion === currentVersion && existsSync(targetSkillsDir)) {
    return true;
  }

  try {
    mkdirSync(taskManagerHome, { recursive: true });

    // Full replace so renamed/deleted skill files don't linger.
    if (existsSync(targetSkillsDir)) {
      rmSync(targetSkillsDir, { recursive: true, force: true });
    }

    cpSync(bundledSkillsDir, targetSkillsDir, { recursive: true });
    writeFileSync(versionStampFile, currentVersion + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

const skillsInstalled = installSkills();

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

// Use $HOME so the same local install command works in PowerShell and Unix shells.
const localSkillsSource = '"$HOME/.taskmanager/skills"';

const contentLines = [
  '@hiroleague/taskmanager installed',
  '',
  'To finish setup and start the server, run:',
  '',
  '  hirotaskmanager',
  '',
  'CLI shorthand (boards, tasks, search):',
  '',
  '  hirotm --help',
];

if (skillsInstalled) {
  // Show both sources so users can choose repo-tracked or local bundled skills.
  contentLines.push(
    '',
    'AI agent skills:',
    '',
    '  Repo install:  npx skills add hiro-league/hirotaskmanager',
    `  Local install: npx skills add ${localSkillsSource}`,
    '  Update:        npx skills update',
  );
}

const INNER = Math.max(60, ...contentLines.map((line) => line.length));
const top = `  +${'-'.repeat(INNER + 2)}+`;
const bottom = `  +${'-'.repeat(INNER + 2)}+`;
const row = (t) => `  |  ${t.padEnd(INNER)}|`;

const bannerLines = [
  '',
  top,
  ...contentLines.map(row),
];

bannerLines.push(bottom, '');
const banner = bannerLines.join('\n');

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
