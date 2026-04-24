/**
 * hirotaskmanager interactive setup: compact prompts, inline spinners, and colored values.
 * Uses ANSI only when stdout is a TTY and NO_COLOR is unset.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { ansi, paint } from "../../../shared/terminalColors";

const out = process.stdout;
const SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;
const SPINNER_INTERVAL_MS = 100;
const DEFAULT_SPINNER_MS = 900;

function line(text = ""): void {
  console.log(text);
}

function clearInline(): void {
  if (typeof out.clearLine === "function" && typeof out.cursorTo === "function") {
    out.clearLine(0);
    out.cursorTo(0);
  }
}

function writeInline(text: string): void {
  clearInline();
  out.write(text);
}

export function paintValue(value: string | number | boolean): string {
  return paint(out, String(value), ansi.bold + ansi.cyan);
}

function paintSuccess(text: string): string {
  return paint(out, text, ansi.bold + ansi.green);
}

function paintWarning(text: string): string {
  return paint(out, text, ansi.bold + ansi.yellow);
}

function printAsciiTable(lines: readonly string[]): void {
  const innerWidth = Math.max(76, ...lines.map((line) => line.length));
  const border = `  +-${"-".repeat(innerWidth)}-+`;
  line();
  line(border);
  for (const entry of lines) {
    line(`  | ${entry.padEnd(innerWidth)} |`);
  }
  line(border);
  line();
}

export type SpinnerHandle = {
  stop: (finalText?: string | null) => void;
};

export function startInlineSpinner(message: string): SpinnerHandle {
  if (!out.isTTY) {
    line(message);
    return {
      stop(finalText?: string | null): void {
        if (finalText) line(finalText);
      },
    };
  }

  let frameIndex = 0;
  let stopped = false;
  writeInline(`${message} ${paint(out, SPINNER_FRAMES[frameIndex], ansi.dim)}`);
  const timer = setInterval(() => {
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
    writeInline(`${message} ${paint(out, SPINNER_FRAMES[frameIndex], ansi.dim)}`);
  }, SPINNER_INTERVAL_MS);

  return {
    stop(finalText?: string | null): void {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      clearInline();
      if (finalText) out.write(`${finalText}\n`);
    },
  };
}

export async function spinForMoment(
  message: string,
  finalText = message,
  durationMs = DEFAULT_SPINNER_MS,
): Promise<void> {
  const spinner = startInlineSpinner(message);
  await Bun.sleep(durationMs);
  spinner.stop(finalText);
}

export function printInteractiveSetupHeader(opts: {
  profileName: string;
  firstProfileOnMachine: boolean;
}): void {
  // Keep the setup header to one line so first run stays dense and scannable.
  line(
    paint(
      out,
      opts.firstProfileOnMachine
        ? "Hiro Task Manager - First-time Setup..."
        : `Hiro Task Manager - Profile Setup: ${opts.profileName}`,
      ansi.bold + ansi.cyan,
    ),
  );
}

export function printSavedProfileSummary(opts: {
  created: boolean;
  profileName: string;
  /** Local loopback URL the server actually listens for the local CLI/browser. */
  appUrl: string;
  dataDir: string;
  openBrowser: boolean;
  /** Bind address as written to the profile. Used to clarify reachability when non-loopback. */
  bindAddress?: string;
}): void {
  line(
    `${opts.created ? paintSuccess("Profile Created:") : paintSuccess("Profile Saved:")} ${paintValue(opts.profileName)}`,
  );
  line(`  ${paintWarning("App URL:")}      ${paintValue(opts.appUrl)}`);
  // When the server is bound to a non-loopback address (e.g. 0.0.0.0), the
  // loopback URL above only works locally. The real public URL depends on the
  // operator's network/reverse-proxy choice and we cannot know it from the
  // profile alone — surface a clear note instead of silently misleading.
  // (issue #20 follow-up: previously this only ever showed 127.0.0.1.)
  if (opts.bindAddress && !isLoopbackAddrLiteral(opts.bindAddress)) {
    line(
      `  ${paintWarning("Bind:")}         ${paintValue(opts.bindAddress)} ${paint(
        out,
        "(remote callers reach this via your reverse proxy / public host, not the App URL above)",
        ansi.dim,
      )}`,
    );
  }
  line(`  ${paintWarning("Data Path:")}    ${paintValue(opts.dataDir)}`);
  line(
    `  ${paintWarning("Open Browser:")} ${paintValue(opts.openBrowser ? "Yes" : "No")}`,
  );
}

function isLoopbackAddrLiteral(addr: string): boolean {
  const t = addr.trim().toLowerCase();
  return t === "127.0.0.1" || t === "localhost" || t === "::1";
}

export function printSetupNextSteps(opts: {
  profileName: string;
  skillsInstalled: boolean;
}): void {
  const cliHelpCommand =
    opts.profileName === "default"
      ? "hirotm --help"
      : `hirotm --profile ${opts.profileName} --help`;
  const skillLines = [
    "1. Repo skills  : npx skills add hiro-league/hirotaskmanager",
  ];
  if (opts.skillsInstalled) {
    skillLines.push("2. Local skills : npx skills add \"$HOME/.taskmanager/skills\"");
    skillLines.push("3. Update later : npx skills update");
  } else {
    skillLines.push("2. Update later : npx skills update");
  }
  const lines = [
    "**IMPORTANT**",
    "Install AI agent skills on the machine where you will run hirotm cli.",
    "",
    ...skillLines,
    "",
    `Explore the CLI: ${cliHelpCommand}`,
    "",
    "Tip: using Bun? Replace 'npx' with 'bunx'.",
  ];

  // Package managers may block postinstall hooks, so setup must surface the
  // exact skills commands in a standalone table before startup continues.
  printAsciiTable(lines);
}

export function printSetupContinuePrompt(): void {
  line("Press Enter to continue and start TaskManager...");
}

export async function printPassphraseHint(): Promise<void> {
  // Keep the browser handoff to one line because the recovery key prints later from the server.
  const text =
    "Create your passphrase in the browser. Your recovery key prints here once.";
  await spinForMoment(text, text);
}

/**
 * Prints the freshly-minted CLI API key so an operator can copy it on the
 * one (and only) chance they get.
 *
 * Copy-safety is the design constraint: the key MUST sit on its own line
 * with NOTHING before or after it (no `| `, no quotes, no trailing spaces),
 * so a triple-click selects exactly the key value with no surrounding
 * characters. Visual emphasis is therefore placed on the lines ABOVE and
 * BELOW the key (rules + label + bold-cyan tint of the key itself), never
 * on the same line as the key.
 *
 * Pipe-safe: when stdout is not a TTY (CI, `| tee`, redirected setup logs)
 * the helper drops the rules/colors and just prints heading + key + hint,
 * each on its own line, so captured output stays easy to grep and pipe.
 */
export function printCliApiKey(
  key: string,
  opts: { profileName: string; nonInteractive?: boolean },
): void {
  const headingLabel = `CLI API Key for profile "${opts.profileName}" (one-time display):`;
  const savedHint =
    "Saved to this profile as api_key. It will not be shown again.";
  const copyHint =
    "Tip: triple-click the key line above to select just the key.";

  if (!out.isTTY || opts.nonInteractive) {
    line();
    line(headingLabel);
    line(key);
    line(savedHint);
    line();
    return;
  }

  // Bracket the key with horizontal rules to draw the eye, but keep the
  // key's own line completely clean so copy-paste captures only the key
  // (issue #31342).
  const rule = "=".repeat(Math.max(72, key.length));
  line();
  line(paintWarning(headingLabel));
  line(paint(out, rule, ansi.yellow));
  line(paintValue(key));
  line(paint(out, rule, ansi.yellow));
  line(paint(out, savedHint, ansi.dim));
  line(paint(out, copyHint, ansi.dim));
  line();
}

/**
 * Print the one-time bootstrap setup token (task #31338) so the operator can
 * paste it into the browser's setup screen. Same copy-safety rules as
 * {@link printCliApiKey}: token sits on its own line with nothing before or
 * after it, so a triple-click selects exactly the value.
 *
 * Also prints the deep-link URL `<appUrl>/?setupToken=<token>` so the
 * operator can click through and have the token auto-filled — this is the
 * fast path on a desktop where the server terminal and the browser are on
 * the same machine. Pipe-safe: drops colours/rules when stdout is not a TTY.
 */
export function printSetupToken(opts: {
  token: string;
  appUrl: string;
  bindAddress?: string;
}): void {
  const { token, appUrl, bindAddress } = opts;
  const headingLabel =
    "First-time Setup Token (one-time, required to create the passphrase):";
  const reachabilityHint =
    bindAddress && !isLoopbackAddrLiteral(bindAddress)
      ? `Open this in a browser on the server (or via your reverse proxy / public host — bind: ${bindAddress}):`
      : "Open this in your browser:";
  const deepLink = `${appUrl}/?setupToken=${encodeURIComponent(token)}`;
  const purposeHint =
    "Required for the very first passphrase.";

  if (!out.isTTY) {
    line();
    line(headingLabel);
    line(token);
    line(reachabilityHint);
    line(deepLink);
    line(purposeHint);
    line();
    return;
  }

  const rule = "=".repeat(Math.max(72, token.length, deepLink.length));
  line();
  line(paintWarning(headingLabel));
  line(paint(out, rule, ansi.yellow));
  line(paintValue(token));
  line(paint(out, rule, ansi.yellow));
  line(paint(out, reachabilityHint, ansi.dim));
  line(paintValue(deepLink));
  line(paint(out, purposeHint, ansi.dim));
  line();
}

export function printRecoveryKey(recoveryKey: string): void {
  line();
  line(paintWarning("Recovery Key:"));
  line(paintValue(recoveryKey));
  line(
    paint(
      out,
      "Store it on a separate device. It will never show again.",
      ansi.dim,
    ),
  );
  line(
    paint(
      out,
      "Use it to recover your passphrase and access your server/data.",
      ansi.dim,
    ),
  );
  line();
}

export function printRecoveryKeyExitHint(appUrl: string): void {
  // Explain why Enter returns to the shell without implying the server is stopping.
  line(
    `After you copy the recovery key, press Enter to close this launcher. TaskManager stays running at ${paintValue(appUrl)}.`,
  );
}

export function isAuthInitialized(authDir: string): boolean {
  return existsSync(path.join(authDir, "auth.json"));
}
