import { describe, expect, test } from "bun:test";
import { printSetupContinuePrompt, printSetupNextSteps } from "./launcherUi";

async function captureConsoleLog(
  run: () => Promise<void> | void,
): Promise<string> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await run();
  } finally {
    console.log = originalLog;
  }
  return `${lines.join("\n")}\n`;
}

describe("printSetupNextSteps", () => {
  test("prints a prominent table with required repo skills install guidance", async () => {
    const stdout = await captureConsoleLog(async () => {
      printSetupNextSteps({
        profileName: "default",
        skillsInstalled: false,
      });
    });

    expect(stdout).toContain("+-");
    expect(stdout).toContain("REQUIRED BEFORE USING hirotm");
    expect(stdout).toContain("Install AI agent skills on the machine where you will run hirotm.");
    expect(stdout).toContain("hirotm --help");
    expect(stdout).toContain("1. Repo skills  : npx skills add hiro-league/hirotaskmanager");
    expect(stdout).toContain("2. Update later : npx skills update");
    expect(stdout).toContain("Tip: using Bun? Replace 'npx' with 'bunx'.");
    expect(stdout).toContain("npx skills add hiro-league/hirotaskmanager");
    expect(stdout).not.toContain("npx skills add \"$HOME/.taskmanager/skills\"");
  });

  test("prints local skills command when bundled skills were copied", async () => {
    const stdout = await captureConsoleLog(async () => {
      printSetupNextSteps({
        profileName: "default",
        skillsInstalled: true,
      });
    });

    expect(stdout).toContain("npx skills add hiro-league/hirotaskmanager");
    expect(stdout).toContain("Tip: using Bun? Replace 'npx' with 'bunx'.");
    expect(stdout).toContain("2. Local skills : npx skills add \"$HOME/.taskmanager/skills\"");
    expect(stdout).toContain("3. Update later : npx skills update");
    expect(stdout).toContain("npx skills add \"$HOME/.taskmanager/skills\"");
    expect(stdout).toContain("npx skills update");
  });

  test("prints profile-specific CLI guidance for named profiles", async () => {
    const stdout = await captureConsoleLog(async () => {
      printSetupNextSteps({
        profileName: "work",
        skillsInstalled: false,
      });
    });

    expect(stdout).toContain("hirotm --profile work --help");
  });
});

describe("printSetupContinuePrompt", () => {
  test("prints a separate enter-to-continue message", async () => {
    const stdout = await captureConsoleLog(() => {
      printSetupContinuePrompt();
    });

    expect(stdout).toContain("Press Enter to continue and start TaskManager...");
  });
});
