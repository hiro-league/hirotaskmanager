/**
 * hirotaskmanager interactive setup: compact prompts, inline spinners, and colored values.
 * Uses ANSI only when stdout is a TTY and NO_COLOR is unset.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { ansi, paint } from "../../shared/terminalColors";

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

export function formatTextPrompt(label: string, defaultValue: string): string {
  return `${label}: ${paintValue(`[${defaultValue}]`)}`;
}

export function formatBooleanPrompt(
  label: string,
  defaultValue: boolean,
): string {
  return `${label} ${paintValue(`[${defaultValue ? "Y/n" : "y/N"}]`)}`;
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
  appUrl: string;
  dataDir: string;
  openBrowser: boolean;
}): void {
  line(
    `${opts.created ? paintSuccess("Profile Created:") : paintSuccess("Profile Saved:")} ${paintValue(opts.profileName)}`,
  );
  line(`  ${paintWarning("App URL:")}      ${paintValue(opts.appUrl)}`);
  line(`  ${paintWarning("Data Path:")}    ${paintValue(opts.dataDir)}`);
  line(
    `  ${paintWarning("Open Browser:")} ${paintValue(opts.openBrowser ? "Yes" : "No")}`,
  );
}

export async function printPassphraseHint(): Promise<void> {
  // Keep the browser handoff to one line because the recovery key prints later from the server.
  const text =
    "Create your passphrase in the browser. Your recovery key prints here once.";
  await spinForMoment(text, text);
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
