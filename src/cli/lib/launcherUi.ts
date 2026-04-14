/**
 * hirotaskmanager interactive setup: banners, summaries, and first-run hints.
 * Uses ANSI only when stdout is a TTY and NO_COLOR is unset.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { ansi, colorEnabled, paint } from "../../shared/terminalColors";

const out = process.stdout;

function line(text = ""): void {
  console.log(text);
}

function hr(): void {
  line(colorEnabled(out) ? `${ansi.dim}────────────────────────────────────────────────────────────${ansi.reset}` : "────────────────────────────────────────────────────────────");
}

export function printInteractiveSetupHeader(opts: {
  profileName: string;
  firstProfileOnMachine: boolean;
}): void {
  line();
  hr();
  if (opts.firstProfileOnMachine) {
    line(
      paint(out, "TaskManager — first-time setup", ansi.bold + ansi.cyan),
    );
    line(
      paint(
        out,
        "No profiles were found yet. This wizard creates your default profile and saves it under your user folder.",
        ansi.dim,
      ),
    );
  } else {
    line(paint(out, "TaskManager — profile setup", ansi.bold + ansi.cyan));
    line(
      paint(
        out,
        `Configure profile "${opts.profileName}" (launcher settings and paths).`,
        ansi.dim,
      ),
    );
  }
  hr();
  line();
}

export function printPortPromptExplainer(): void {
  line(paint(out, "Local URL port", ansi.bold));
  line(
    paint(
      out,
      "This port is where the web app and HTTP API listen on this machine only.",
      ansi.dim,
    ),
  );
  line(
    paint(
      out,
      "You will open: http://127.0.0.1:<port>  (and hirotm uses the same port.)",
      ansi.dim,
    ),
  );
  line();
}

export function printDataDirExplainer(): void {
  line(paint(out, "Data directory", ansi.bold));
  line(
    paint(
      out,
      "Your SQLite database (taskmanager.db) and on-disk app data are stored here.",
      ansi.dim,
    ),
  );
  line(
    paint(
      out,
      "Pick a folder you can back up; avoid network drives if you care about reliability.",
      ansi.dim,
    ),
  );
  line();
}

export function printOpenBrowserExplainer(): void {
  line(paint(out, "Open browser when the server starts", ansi.bold));
  line(
    paint(
      out,
      "If you choose yes, your default browser opens to the app URL right after the server is ready.",
      ansi.dim,
    ),
  );
  line();
}

export function printSavedProfileSummary(opts: {
  profileName: string;
  configPath: string;
  profileRootDir: string;
  dataDir: string;
  authDir: string;
}): void {
  line();
  hr();
  line(paint(out, "Profile saved", ansi.bold + ansi.green));
  line(`  ${paint(out, "Profile name", ansi.dim)}   ${opts.profileName}`);
  line(`  ${paint(out, "Config file", ansi.dim)}    ${opts.configPath}`);
  line(`  ${paint(out, "Profile folder", ansi.dim)} ${opts.profileRootDir}`);
  line(`  ${paint(out, "Data (database)", ansi.dim)} ${opts.dataDir}`);
  line(`  ${paint(out, "Auth storage", ansi.dim)}    ${opts.authDir}`);
  hr();
  line();
}

export function printStartingServer(port: number): void {
  line(
    paint(
      out,
      `Starting TaskManager server on port ${port} …`,
      ansi.bold + ansi.cyan,
    ),
  );
}

export function printRunningAt(url: string): void {
  line(paint(out, `Running at ${url}`, ansi.bold + ansi.green));
}

/**
 * After interactive setup, before browser opens: web passphrase + recovery key + skills.
 */
export function printFirstWebAuthAndSkillsBox(opts: {
  appUrl: string;
}): void {
  line();
  hr();
  line(
    paint(out, "Next: unlock the web app", ansi.bold + ansi.yellow),
  );
  line(
    paint(
      out,
      "1. In the browser, create your passphrase (this encrypts local access to Task Manager).",
      ansi.reset,
    ),
  );
  line(
    paint(
      out,
      "2. After you submit it, come back to this terminal — your recovery key prints here once.",
      ansi.reset,
    ),
  );
  line(
    paint(
      out,
      "   " + paint(out, "Copy that key and store it outside the app.", ansi.magenta),
      ansi.reset,
    ),
  );
  line();
  line(
    paint(out, `App URL: ${opts.appUrl}`, ansi.cyan),
  );
  line();
  line(paint(out, "Agent skills (optional)", ansi.bold));
  line(
    paint(
      out,
      "From a clone of the hirotaskmanager repo, install the bundled skill for AI agents:",
      ansi.dim,
    ),
  );
  line(
    paint(
      out,
      "  npx skills add ./skills/hiro-task-manager-cli",
      ansi.cyan,
    ),
  );
  line(
    paint(
      out,
      "(Run from the repository root. Adjust the path if your clone lives elsewhere.)",
      ansi.dim,
    ),
  );
  hr();
  line();
}

export function isAuthInitialized(authDir: string): boolean {
  return existsSync(path.join(authDir, "auth.json"));
}
