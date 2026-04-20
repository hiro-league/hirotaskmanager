import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { runServerSetupWizard } from "./setupWizards";
import { resetRuntimeConfigSelectionForTests } from "../../shared/runtimeConfig";

// The interactive server wizard always offers "Mint a CLI API key now?" on a
// fresh server profile (regardless of require_cli_api_key policy), with a
// policy-aware default and a breadcrumb command printed when the operator
// declines. These tests pin that contract end-to-end: scripted stdin drives
// the full prompt sequence, and we assert on what landed in the profile and
// what was printed.

interface ScriptedRun {
  readonly tmpRoot: string;
  readonly profile: string;
  /** Lines written via console.log (post-prompt status, breadcrumbs, etc.). */
  readonly stdoutLines: string[];
  readonly stderrLines: string[];
  /**
   * Lines written via process.stdout.write — this is where readline prompt
   * questions surface, since `rl.question(...)` writes the question text
   * straight to stdout rather than going through console.log. We split on `\n`
   * and discard the spinner clear/redraw fragments so prompt-text assertions
   * stay readable.
   */
  readonly stdoutWriteLines: string[];
}

/**
 * Drive `runServerSetupWizard` with a fixed script of prompt answers.
 *
 * The wizard creates a fresh `readline` interface for every prompt and reads
 * from `process.stdin`. We swap stdin for a single `Readable` that emits the
 * scripted lines; consecutive readline interfaces drain it sequentially. TTY
 * is forced on for both stdin and stdout so the wizard takes the interactive
 * branch; ANSI is suppressed via NO_COLOR so output assertions stay readable.
 */
async function runScriptedServerWizard(opts: {
  tmpRoot: string;
  profile: string;
  rerun?: boolean;
  answers: readonly string[];
}): Promise<ScriptedRun> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let stdoutWriteBuffer = "";
  const stdoutWriteLines: string[] = [];

  const fakeStdin = Readable.from(
    (async function* () {
      for (const line of opts.answers) {
        yield `${line}\n`;
      }
    })(),
  );

  const originalStdin = process.stdin;
  const originalStdinIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalNoColor = process.env.NO_COLOR;
  const originalLog = console.log;
  const originalErr = console.error;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);

  Object.defineProperty(process, "stdin", {
    configurable: true,
    get: () => fakeStdin,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: true,
  });
  // canPromptInteractively() requires both stdin.isTTY and stdout.isTTY.
  Object.defineProperty(fakeStdin, "isTTY", {
    configurable: true,
    value: true,
  });
  process.env.NO_COLOR = "1";

  console.log = (...args: unknown[]): void => {
    stdoutLines.push(args.map((a) => String(a)).join(" "));
  };
  console.error = (...args: unknown[]): void => {
    stderrLines.push(args.map((a) => String(a)).join(" "));
  };
  // process.stdout.write is what readline's question() and the spinner use;
  // intercept it so we can assert on prompt text. Spinner frames write
  // partial lines, so buffer-and-split keeps logical lines whole. Also drop
  // ANSI clearLine sequences (`\x1b[2K`) and `cursorTo(0)` (`\r`) noise.
  process.stdout.write = ((chunk: unknown): boolean => {
    const text =
      typeof chunk === "string"
        ? chunk
        : chunk instanceof Buffer
          ? chunk.toString("utf8")
          : String(chunk);
    stdoutWriteBuffer += text;
    let nl: number;
    while ((nl = stdoutWriteBuffer.indexOf("\n")) >= 0) {
      stdoutWriteLines.push(stdoutWriteBuffer.slice(0, nl));
      stdoutWriteBuffer = stdoutWriteBuffer.slice(nl + 1);
    }
    return true;
  }) as typeof process.stdout.write;

  try {
    await runServerSetupWizard({
      profile: opts.profile,
      rerun: opts.rerun ?? false,
    });
  } finally {
    Object.defineProperty(process, "stdin", {
      configurable: true,
      get: () => originalStdin,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutIsTTY,
    });
    if (originalStdinIsTTY === undefined) {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    } else {
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinIsTTY,
      });
    }
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
    console.log = originalLog;
    console.error = originalErr;
    process.stdout.write = originalStdoutWrite;
  }

  if (stdoutWriteBuffer.length > 0) stdoutWriteLines.push(stdoutWriteBuffer);

  return {
    tmpRoot: opts.tmpRoot,
    profile: opts.profile,
    stdoutLines,
    stderrLines,
    stdoutWriteLines,
  };
}

function readProfileConfig(tmpRoot: string, profile: string): Record<string, unknown> {
  const configPath = path.join(
    tmpRoot,
    ".taskmanager",
    "profiles",
    profile,
    "config.json",
  );
  return JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
}

describe("server setup wizard: mint prompt + breadcrumb", () => {
  let tmpRoot: string;
  let prevHome: string | undefined;
  let prevUserProfile: string | undefined;

  beforeEach(() => {
    resetRuntimeConfigSelectionForTests();
    tmpRoot = mkdtempSync(path.join(tmpdir(), "tm-mint-"));
    prevHome = process.env.HOME;
    prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpRoot;
    process.env.USERPROFILE = tmpRoot;
  });

  afterEach(() => {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.env.HOME = prevHome;
    if (prevUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = prevUserProfile;
    }
  });

  test("loopback-only + no-auth: mint prompt is offered with default N, declining prints the day-2 command", async () => {
    const profile = "server";
    const run = await runScriptedServerWizard({
      tmpRoot,
      profile,
      answers: [
        "", // 1. profile name (accept default)
        "", // 2. port
        "", // 3. data dir
        "", // 4. accept remote? (default N)
        "", // 5. require CLI API key locally? (default N)
        "n", // 6. open browser (force N — keeps Bun.sleep noise minimal)
        "", // 7. mint key now? (default N because policy doesn't require it)
        "n", // 8. set as default profile? (force N — single-profile machine, both Y/N work)
        "n", // 9. start server now? (force N)
      ],
    });

    const cfg = readProfileConfig(tmpRoot, profile);
    expect(cfg.role).toBe("server");
    expect(cfg.bind_address).toBe("127.0.0.1");
    expect(cfg.require_cli_api_key).toBeUndefined();
    expect(cfg.api_key).toBeUndefined();

    // Mint prompt was actually shown with N as the default ([y/N], not [Y/n]).
    // Prompt text comes through readline's question() -> process.stdout.write.
    const mintPromptLine = run.stdoutWriteLines.find((l) =>
      l.includes("Mint a CLI API key now?"),
    );
    expect(mintPromptLine).toBeDefined();
    expect(mintPromptLine!).toContain("[y/N]");
    expect(mintPromptLine!).toContain("Not needed for local CLI use");

    // Breadcrumb printed after declining.
    expect(
      run.stdoutLines.some((l) =>
        l.includes("No CLI API key minted. To create one later, run:"),
      ),
    ).toBe(true);
    expect(
      run.stdoutLines.some(
        (l) =>
          l.includes("hirotaskmanager server api-key generate") &&
          l.includes(`--profile ${profile}`),
      ),
    ).toBe(true);
  });

  test("loopback-only + no-auth: accepting the mint prompt creates a tmk- key and writes it to the profile", async () => {
    const profile = "server";
    const run = await runScriptedServerWizard({
      tmpRoot,
      profile,
      answers: [
        "", // profile name
        "", // port
        "", // data dir
        "", // accept remote? N
        "", // require CLI API key locally? N
        "n", // open browser
        "y", // mint key now? -> Y
        "n", // set as default? N
        "n", // start now? N
      ],
    });

    const cfg = readProfileConfig(tmpRoot, profile);
    expect(typeof cfg.api_key).toBe("string");
    expect(cfg.api_key as string).toMatch(/^tmk-[0-9a-f]{64}$/);
    expect(cfg.require_cli_api_key).toBeUndefined(); // policy unchanged

    // Breadcrumb must NOT appear when a key was minted.
    expect(
      run.stdoutLines.some((l) =>
        l.includes("No CLI API key minted. To create one later, run:"),
      ),
    ).toBe(false);
  });

  test("require_cli_api_key=Y: mint prompt defaults to Y and uses the policy-aware wording", async () => {
    const profile = "server";
    const run = await runScriptedServerWizard({
      tmpRoot,
      profile,
      answers: [
        "", // profile name
        "", // port
        "", // data dir
        "", // accept remote? N (stay loopback)
        "y", // require CLI API key locally? Y -> needsKeyByPolicy=true
        "n", // open browser
        "", // mint key now? -> default Y under this policy
        "n", // set as default? N
        "n", // start now? N
      ],
    });

    const cfg = readProfileConfig(tmpRoot, profile);
    expect(cfg.require_cli_api_key).toBe(true);
    expect(typeof cfg.api_key).toBe("string");
    expect(cfg.api_key as string).toMatch(/^tmk-[0-9a-f]{64}$/);

    const mintPromptLine = run.stdoutWriteLines.find((l) =>
      l.includes("Mint a CLI API key now?"),
    );
    expect(mintPromptLine).toBeDefined();
    expect(mintPromptLine!).toContain("[Y/n]");
    expect(mintPromptLine!).toContain("server requires one");

    expect(
      run.stdoutLines.some((l) =>
        l.includes("No CLI API key minted. To create one later, run:"),
      ),
    ).toBe(false);
  });

  test("re-run with an existing api_key: mint prompt is skipped entirely (no overwrite, no breadcrumb)", async () => {
    const profile = "server";
    const profileDir = path.join(tmpRoot, ".taskmanager", "profiles", profile);
    mkdirSync(profileDir, { recursive: true });
    const preExistingKey = `tmk-${"a".repeat(64)}`;
    writeFileSync(
      path.join(profileDir, "config.json"),
      JSON.stringify({
        role: "server",
        port: 3001,
        data_dir: path.join(profileDir, "data"),
        bind_address: "127.0.0.1",
        api_key: preExistingKey,
      }),
      "utf8",
    );

    // rerun=true skips the "Profile name" prompt, so one fewer answer.
    const run = await runScriptedServerWizard({
      tmpRoot,
      profile,
      rerun: true,
      answers: [
        "", // port
        "", // data dir
        "", // accept remote? N
        "", // require CLI API key locally? N
        "n", // open browser
        // (no mint prompt because existing.api_key is set)
        "n", // set as default? N
        "n", // start now? N
      ],
    });

    const cfg = readProfileConfig(tmpRoot, profile);
    expect(cfg.api_key).toBe(preExistingKey);

    expect(
      run.stdoutWriteLines.some((l) => l.includes("Mint a CLI API key now?")),
    ).toBe(false);
    expect(
      run.stdoutLines.some((l) =>
        l.includes("No CLI API key minted. To create one later, run:"),
      ),
    ).toBe(false);
  });
});
