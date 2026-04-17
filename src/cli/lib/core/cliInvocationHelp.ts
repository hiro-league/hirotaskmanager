/**
 * clig.dev-style concise help when argv is bare `hirotm` (cli guidelines review #10) and
 * one-line hints after Commander missing-required-option errors (navigation vs invalid leaf).
 */
import path from "node:path";
import { CLI_PACKAGE_VERSION } from "../../cliVersion";
import { HIROTM_CLI_DOCS_OVERVIEW_URL } from "./cliWebDocs";

const SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

export function isLikelyCliEntryScriptPath(arg: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(arg));
}

/**
 * True when the user did not pass a subcommand path — only the runtime/entry (`bun` … `hirotm.ts`)
 * with no further tokens. Matches Commander’s effective “nothing to do” for direct CLI use and
 * `bun run …/hirotm.ts` style (first user token is the script path).
 */
export function shouldShowConciseHirotmRootHelp(argv: string[]): boolean {
  const tail = argv.slice(2);
  if (tail.length === 0) {
    return true;
  }
  if (tail.length >= 2) {
    return false;
  }
  const only = tail[0]!;
  if (only.startsWith("-")) {
    return false;
  }
  return isLikelyCliEntryScriptPath(only);
}

export function printConciseHirotmRootHelp(): void {
  const text = [
    `hirotm — TaskManager CLI (v${CLI_PACKAGE_VERSION})`,
    "",
    "Examples:",
    "  hirotm boards list",
    "  hirotm tasks list --board <board-slug-or-id>",
    "  hirotm server status",
    "",
    "Run hirotm --help for all commands and global options.",
    `Docs: ${HIROTM_CLI_DOCS_OVERVIEW_URL}`,
    "",
  ].join("\n");
  process.stdout.write(text);
}

/** Drop leading script path when present (`bun run src/.../hirotm.ts boards list`). */
export function stripOptionalScriptPathFromUserArgs(args: string[]): string[] {
  if (args.length === 0) {
    return args;
  }
  if (isLikelyCliEntryScriptPath(args[0]!)) {
    return args.slice(1);
  }
  return args;
}

/** Globals from `createHirotmProgram()` that may appear before the subcommand path. */
function stripLeadingGlobalHirotmFlags(args: string[]): string[] {
  const out = [...args];
  while (out.length > 0) {
    const a = out[0]!;
    if (
      a === "--profile" ||
      a === "--client-name" ||
      a === "--format"
    ) {
      out.shift();
      if (out.length > 0) {
        out.shift();
      }
      continue;
    }
    if (
      a.startsWith("--profile=") ||
      a.startsWith("--client-name=") ||
      a.startsWith("--format=")
    ) {
      out.shift();
      continue;
    }
    if (a === "-q" || a === "--quiet" || a === "--no-color") {
      out.shift();
      continue;
    }
    if (a === "-h" || a === "--help" || a === "-V" || a === "--version") {
      out.shift();
      continue;
    }
    if (a === "--dev") {
      out.shift();
      continue;
    }
    break;
  }
  return out;
}

/**
 * Line to append after Commander’s “required option … not specified” on stderr.
 * Uses argv so hints work for `bun run …/hirotm.ts <globals> tasks list` subprocess tests.
 */
export function formatMandatoryOptionHelpHintLine(argv: string[]): string {
  let rest = argv.slice(2);
  rest = stripOptionalScriptPathFromUserArgs(rest);
  rest = stripLeadingGlobalHirotmFlags(rest);
  const subParts: string[] = [];
  for (const token of rest) {
    if (token.startsWith("-")) {
      break;
    }
    subParts.push(token);
  }
  if (subParts.length === 0) {
    return "Run `hirotm --help` for usage.";
  }
  return `Run \`hirotm ${subParts.join(" ")} --help\` for all options.`;
}
