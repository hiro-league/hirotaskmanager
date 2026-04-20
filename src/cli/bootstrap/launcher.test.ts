import { describe, expect, test } from "bun:test";
import { resolveLauncherStartPlan } from "./launcher";

describe("resolveLauncherStartPlan", () => {
  test("uses background mode by default outside setup", () => {
    expect(
      resolveLauncherStartPlan({
        shouldRunSetup: false,
        needsRecoveryKeyExitFlow: false,
        alreadyRunning: false,
        shouldOpenBrowser: true,
      }),
    ).toEqual({
      startMode: "background",
      readyLabel: "Started",
      shouldOpenBrowserOnReady: true,
    });
  });

  test("allows explicit foreground outside setup", () => {
    expect(
      resolveLauncherStartPlan({
        shouldRunSetup: false,
        needsRecoveryKeyExitFlow: false,
        alreadyRunning: false,
        shouldOpenBrowser: false,
        preferForegroundWhenNotSetup: true,
      }).startMode,
    ).toBe("foreground");
  });

  test("does not reopen browser when already running", () => {
    expect(
      resolveLauncherStartPlan({
        shouldRunSetup: false,
        needsRecoveryKeyExitFlow: false,
        alreadyRunning: true,
        shouldOpenBrowser: true,
      }),
    ).toEqual({
      startMode: "background",
      readyLabel: "Already started",
      shouldOpenBrowserOnReady: false,
    });
  });

  test("uses background-attached for recovery outside setup wizard (e.g. server start resume)", () => {
    expect(
      resolveLauncherStartPlan({
        shouldRunSetup: false,
        needsRecoveryKeyExitFlow: true,
        alreadyRunning: false,
        shouldOpenBrowser: false,
        preferForegroundWhenNotSetup: false,
      }).startMode,
    ).toBe("background-attached");
  });

  test("keeps setup launches attached unless recovery flow needs background-attached", () => {
    expect(
      resolveLauncherStartPlan({
        shouldRunSetup: true,
        needsRecoveryKeyExitFlow: false,
        alreadyRunning: false,
        shouldOpenBrowser: true,
      }).startMode,
    ).toBe("foreground");

    expect(
      resolveLauncherStartPlan({
        shouldRunSetup: true,
        needsRecoveryKeyExitFlow: true,
        alreadyRunning: false,
        shouldOpenBrowser: true,
      }).startMode,
    ).toBe("background-attached");
  });
});
