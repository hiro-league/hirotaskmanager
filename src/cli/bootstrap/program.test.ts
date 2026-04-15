import { describe, expect, test } from "bun:test";
import {
  getHirotmLauncherSetupCommand,
  shouldRequireLauncherSetupForHirotm,
} from "./program";

describe("shouldRequireLauncherSetupForHirotm", () => {
  test("requires launcher setup for installed mode without a saved profile", () => {
    expect(
      shouldRequireLauncherSetupForHirotm({
        runtimeKind: "installed",
        hasInstalledProfileConfig: false,
      }),
    ).toBe(true);
  });

  test("allows installed mode once the profile config exists", () => {
    expect(
      shouldRequireLauncherSetupForHirotm({
        runtimeKind: "installed",
        hasInstalledProfileConfig: true,
      }),
    ).toBe(false);
  });

  test("never blocks dev mode on launcher setup", () => {
    expect(
      shouldRequireLauncherSetupForHirotm({
        runtimeKind: "dev",
        hasInstalledProfileConfig: false,
      }),
    ).toBe(false);
  });
});

describe("getHirotmLauncherSetupCommand", () => {
  test("uses the plain launcher command for the default profile", () => {
    expect(getHirotmLauncherSetupCommand("default")).toBe("hirotaskmanager");
  });

  test("includes the selected profile for named profiles", () => {
    expect(getHirotmLauncherSetupCommand("work")).toBe(
      "hirotaskmanager --profile work",
    );
  });
});
