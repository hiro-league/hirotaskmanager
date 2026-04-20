import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  needsInstalledBootstrapCeremony,
  resolveEffectiveServerSetupLifecycleState,
  resolvePersistedServerSetupStateForConfigWrite,
} from "./serverSetupLifecycle";

describe("serverSetupLifecycle", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // test cleanup best-effort
      }
    }
  });

  test("no auth → profile_saved", () => {
    const authDir = mkdtempSync(path.join(tmpdir(), "tm-lc-"));
    dirs.push(authDir);
    expect(
      resolveEffectiveServerSetupLifecycleState("server", undefined, authDir),
    ).toBe("profile_saved");
    expect(needsInstalledBootstrapCeremony("profile_saved")).toBe(true);
  });

  test("auth + recovery tmp → passphrase_set", () => {
    const authDir = mkdtempSync(path.join(tmpdir(), "tm-lc-"));
    dirs.push(authDir);
    writeFileSync(path.join(authDir, "auth.json"), "{}", "utf8");
    writeFileSync(path.join(authDir, "recovery-key.tmp"), "rk", "utf8");
    expect(
      resolveEffectiveServerSetupLifecycleState("server", "profile_saved", authDir),
    ).toBe("passphrase_set");
    expect(needsInstalledBootstrapCeremony("passphrase_set")).toBe(true);
  });

  test("auth, no recovery tmp → complete", () => {
    const authDir = mkdtempSync(path.join(tmpdir(), "tm-lc-"));
    dirs.push(authDir);
    writeFileSync(path.join(authDir, "auth.json"), "{}", "utf8");
    expect(
      resolveEffectiveServerSetupLifecycleState("server", undefined, authDir),
    ).toBe("complete");
    expect(needsInstalledBootstrapCeremony("complete")).toBe(false);
  });

  test("persisted complete + no auth → profile_saved (stale config)", () => {
    const authDir = mkdtempSync(path.join(tmpdir(), "tm-lc-"));
    dirs.push(authDir);
    expect(
      resolveEffectiveServerSetupLifecycleState("server", "complete", authDir),
    ).toBe("profile_saved");
  });

  test("resolvePersistedServerSetupStateForConfigWrite maps complete", () => {
    const authDir = mkdtempSync(path.join(tmpdir(), "tm-lc-"));
    dirs.push(authDir);
    writeFileSync(path.join(authDir, "auth.json"), "{}", "utf8");
    expect(resolvePersistedServerSetupStateForConfigWrite(undefined, authDir)).toBe(
      "complete",
    );
  });
});
