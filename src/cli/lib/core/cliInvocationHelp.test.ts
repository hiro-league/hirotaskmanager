import { describe, expect, test } from "bun:test";
import {
  formatMandatoryOptionHelpHintLine,
  shouldShowConciseHirotmRootHelp,
} from "./cliInvocationHelp";

describe("shouldShowConciseHirotmRootHelp", () => {
  test("true for no argv after script (direct run)", () => {
    expect(shouldShowConciseHirotmRootHelp(["bun", "hirotm.ts"])).toBe(true);
  });

  test("true for bun run script only", () => {
    expect(
      shouldShowConciseHirotmRootHelp(["bun", "run", "/app/hirotm.ts"]),
    ).toBe(true);
  });

  test("false when subcommand present", () => {
    expect(
      shouldShowConciseHirotmRootHelp(["bun", "run", "x.ts", "boards", "list"]),
    ).toBe(false);
  });

  test("false for --help", () => {
    expect(
      shouldShowConciseHirotmRootHelp(["bun", "hirotm.ts", "--help"]),
    ).toBe(false);
  });
});

describe("formatMandatoryOptionHelpHintLine", () => {
  test("builds subcommand path from tail", () => {
    expect(
      formatMandatoryOptionHelpHintLine([
        "bun",
        "run",
        "/r/hirotm.ts",
        "tasks",
        "list",
      ]),
    ).toBe("Run `hirotm tasks list --help` for all options.");
  });

  test("strips globals before subcommand path", () => {
    expect(
      formatMandatoryOptionHelpHintLine([
        "bun",
        "x.ts",
        "--profile",
        "dev",
        "--port",
        "9",
        "tasks",
        "list",
      ]),
    ).toBe("Run `hirotm tasks list --help` for all options.");
  });

  test("fallback when nothing left after strip", () => {
    expect(
      formatMandatoryOptionHelpHintLine(["bun", "x.ts", "--profile", "dev"]),
    ).toBe("Run `hirotm --help` for usage.");
  });
});
