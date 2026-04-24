import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resetRuntimeConfigSelectionForTests } from "../../shared/runtimeConfig";

// The interactive server wizard always offers "Mint a CLI API key now?" on a
// fresh server profile (regardless of require_cli_api_key policy), with a
// policy-aware default and a breadcrumb command printed when the operator
// declines. These tests pin that contract end-to-end: a per-test answer table
// drives the @inquirer/prompts mock, and we assert on what landed in the
// profile and what was printed.
//
// Prompts are matched by a substring of the prompt's `message` (the wizard's
// own prompt text). When the wizard adds or removes a prompt this test will
// throw with a clear "no scripted answer for prompt: <message>" so the table
// stays in lockstep with the wizard.

interface ScriptedRun {
  readonly tmpRoot: string;
  readonly profile: string;
  readonly stdoutLines: string[];
  readonly stderrLines: string[];
  readonly mintPromptText: string | null;
  readonly mintPromptDefault: "yes" | "no" | null;
}

type AnswerEntry =
  | { kind: "select"; value: "yes" | "no" }
  | { kind: "input"; value: string };

type AnswerMap = ReadonlyArray<readonly [string, AnswerEntry]>;

function findAnswer(
  table: AnswerMap,
  message: string,
  promptKind: "select" | "input",
): AnswerEntry {
  for (const [needle, entry] of table) {
    if (message.includes(needle) && entry.kind === promptKind) return entry;
  }
  throw new Error(
    `No scripted ${promptKind} answer for prompt: "${message}". ` +
      "Add it to the test's answer table.",
  );
}

interface InquirerCallSpy {
  /** Captures every select prompt the wizard renders, in order. */
  readonly selectCalls: { message: string; default?: string }[];
  /** Captures every input prompt the wizard renders, in order. */
  readonly inputCalls: { message: string; default?: string }[];
}

async function runScriptedServerWizard(opts: {
  tmpRoot: string;
  profile: string;
  rerun?: boolean;
  answers: AnswerMap;
}): Promise<ScriptedRun> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const spy: InquirerCallSpy = { selectCalls: [], inputCalls: [] };

  const originalLog = console.log;
  const originalErr = console.error;
  // canPromptInteractively() requires both stdin.isTTY and stdout.isTTY; under
  // bun:test neither is set, so the wizard would take its non-interactive
  // branch (no prompts) without this shim.
  const originalStdinIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
  const originalStdoutIsTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: true,
  });

  console.log = (...args: unknown[]): void => {
    stdoutLines.push(args.map((a) => String(a)).join(" "));
  };
  console.error = (...args: unknown[]): void => {
    stderrLines.push(args.map((a) => String(a)).join(" "));
  };

  // Mock @inquirer/prompts so each prompt resolves with the scripted answer
  // for its message text. We deliberately swap in a fresh module object per
  // test (via mock.module) so answer tables don't leak across tests.
  mock.module("@inquirer/prompts", () => ({
    select: async (config: {
      message: string;
      choices: { value: unknown }[];
      default?: unknown;
    }): Promise<unknown> => {
      spy.selectCalls.push({
        message: config.message,
        default: config.default as string | undefined,
      });
      const ans = findAnswer(opts.answers, config.message, "select");
      return ans.value;
    },
    input: async (config: {
      message: string;
      default?: string;
      validate?: (v: string) => true | string | Promise<true | string>;
    }): Promise<string> => {
      spy.inputCalls.push({ message: config.message, default: config.default });
      const ans = findAnswer(opts.answers, config.message, "input");
      // Honour the validator the wizard installs (so a malformed value in the
      // test would still be caught); a successful validate returns true.
      if (config.validate) {
        const verdict = await config.validate(ans.value);
        if (verdict !== true) {
          throw new Error(
            `Scripted input "${ans.value}" failed validation: ${verdict}`,
          );
        }
      }
      return ans.value;
    },
  }));

  // Re-import the wizard AFTER the mock is installed so it picks up the
  // mocked module. Importing once at the top of the file would bind to the
  // real module before the mock takes effect.
  const { runServerSetupWizard } = await import("./setupWizards");

  try {
    await runServerSetupWizard({
      profile: opts.profile,
      rerun: opts.rerun ?? false,
    });
  } finally {
    console.log = originalLog;
    console.error = originalErr;
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
  }

  const mintCall = spy.selectCalls.find((c) =>
    c.message.includes("Mint a CLI API key now?"),
  );

  return {
    tmpRoot: opts.tmpRoot,
    profile: opts.profile,
    stdoutLines,
    stderrLines,
    mintPromptText: mintCall?.message ?? null,
    mintPromptDefault: (mintCall?.default as "yes" | "no" | undefined) ?? null,
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
    // Note: bun's mock.module persists the mock for the rest of the test
    // run. Each test's runScriptedServerWizard re-installs its own answer
    // table before importing the wizard, so leakage between these tests is
    // controlled. A defensive "throw on unmocked import" stub here breaks
    // unrelated subsequent test files that legitimately import the prompts
    // module via the wizard, so we deliberately don't reset the mock here.
  });

  test("loopback-only + no-auth: mint prompt is offered with default 'no', declining prints the day-2 command", async () => {
    const profile = "server";
    const run = await runScriptedServerWizard({
      tmpRoot,
      profile,
      answers: [
        ["Profile name", { kind: "input", value: profile }],
        ["Pick a port", { kind: "input", value: "" }],
        ["Pick a data directory", { kind: "input", value: "" }],
        [
          "Require a CLI API key for local connections too?",
          { kind: "select", value: "no" },
        ],
        [
          "Open the default browser",
          { kind: "select", value: "no" },
        ],
        [
          "Mint a CLI API key now?",
          { kind: "select", value: "no" },
        ],
        [
          "Set this profile as the default",
          { kind: "select", value: "no" },
        ],
      ],
    });

    const cfg = readProfileConfig(tmpRoot, profile);
    expect(cfg.role).toBe("server");
    expect(cfg.bind_address).toBe("127.0.0.1");
    expect(cfg.require_cli_api_key).toBeUndefined();
    expect(cfg.api_key).toBeUndefined();

    // Mint prompt was actually shown with "no" as the default (default tracks
    // the require_cli_api_key policy: off => mint default no).
    expect(run.mintPromptText).toContain("Mint a CLI API key now?");
    expect(run.mintPromptText).toContain("Not needed for local CLI use");
    expect(run.mintPromptDefault).toBe("no");

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
        ["Profile name", { kind: "input", value: profile }],
        ["Pick a port", { kind: "input", value: "" }],
        ["Pick a data directory", { kind: "input", value: "" }],
        [
          "Require a CLI API key for local connections too?",
          { kind: "select", value: "no" },
        ],
        ["Open the default browser", { kind: "select", value: "no" }],
        ["Mint a CLI API key now?", { kind: "select", value: "yes" }],
        ["Set this profile as the default", { kind: "select", value: "no" }],
      ],
    });

    const cfg = readProfileConfig(tmpRoot, profile);
    expect(typeof cfg.api_key).toBe("string");
    expect(cfg.api_key as string).toMatch(/^tmk-[0-9a-f]{64}$/);
    expect(cfg.require_cli_api_key).toBeUndefined(); // policy unchanged

    expect(
      run.stdoutLines.some((l) =>
        l.includes("No CLI API key minted. To create one later, run:"),
      ),
    ).toBe(false);
  });

  test("require_cli_api_key=yes: mint prompt defaults to 'yes' and uses the policy-aware wording", async () => {
    const profile = "server";
    const run = await runScriptedServerWizard({
      tmpRoot,
      profile,
      answers: [
        ["Profile name", { kind: "input", value: profile }],
        ["Pick a port", { kind: "input", value: "" }],
        ["Pick a data directory", { kind: "input", value: "" }],
        [
          "Require a CLI API key for local connections too?",
          { kind: "select", value: "yes" },
        ],
        ["Open the default browser", { kind: "select", value: "no" }],
        // Accept the mint default — it should be "yes" under this policy.
        ["Mint a CLI API key now?", { kind: "select", value: "yes" }],
        ["Set this profile as the default", { kind: "select", value: "no" }],
      ],
    });

    const cfg = readProfileConfig(tmpRoot, profile);
    expect(cfg.require_cli_api_key).toBe(true);
    expect(typeof cfg.api_key).toBe("string");
    expect(cfg.api_key as string).toMatch(/^tmk-[0-9a-f]{64}$/);

    expect(run.mintPromptText).toContain("Mint a CLI API key now?");
    expect(run.mintPromptText).toContain("server requires one");
    expect(run.mintPromptDefault).toBe("yes");

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

    const run = await runScriptedServerWizard({
      tmpRoot,
      profile,
      rerun: true,
      answers: [
        ["Pick a port", { kind: "input", value: "" }],
        ["Pick a data directory", { kind: "input", value: "" }],
        [
          "Require a CLI API key for local connections too?",
          { kind: "select", value: "no" },
        ],
        ["Open the default browser", { kind: "select", value: "no" }],
        // No mint prompt because existing.api_key is set — if the wizard
        // tries to render one, findAnswer() will throw with a clear message.
        ["Set this profile as the default", { kind: "select", value: "no" }],
      ],
    });

    const cfg = readProfileConfig(tmpRoot, profile);
    expect(cfg.api_key).toBe(preExistingKey);

    expect(run.mintPromptText).toBe(null);
    expect(
      run.stdoutLines.some((l) =>
        l.includes("No CLI API key minted. To create one later, run:"),
      ),
    ).toBe(false);
  });
});
