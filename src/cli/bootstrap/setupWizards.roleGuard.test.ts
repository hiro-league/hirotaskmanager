import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliError } from "../lib/output/output";
import { CLI_ERR } from "../types/errors";
import { runClientSetupWizard, runServerSetupWizard } from "./setupWizards";
import { resetRuntimeConfigSelectionForTests } from "../../shared/runtimeConfig";

// Design §2.8: role is immutable. Re-running --setup-server on a profile that
// already exists as a client (or vice versa) must fail loudly instead of
// silently stomping the existing role/api_key/api_url.
describe("setup wizards: role-stomp guard", () => {
  let tmpRoot: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    resetRuntimeConfigSelectionForTests();
    tmpRoot = mkdtempSync(path.join(tmpdir(), "tm-rolestomp-"));
    prevHome = process.env.HOME;
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
    process.env.USERPROFILE = prevHome;
  });

  test("runServerSetupWizard refuses to convert an existing client profile (rerun=false)", async () => {
    const profile = "work";
    const profileDir = path.join(tmpRoot, ".taskmanager", "profiles", profile);
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      path.join(profileDir, "config.json"),
      JSON.stringify({
        role: "client",
        api_url: "https://remote.example",
        // 64 hex chars after `tmk-` prefix to match the well-formed key shape
        // enforced by validateRuntimeConfigFile (see cliApiKeys.ts:makeKeyString).
        api_key: `tmk-${"a".repeat(64)}`,
      }),
      "utf8",
    );

    await expect(
      runServerSetupWizard({ profile, rerun: false }),
    ).rejects.toMatchObject({
      details: { code: CLI_ERR.invalidArgs, role: "client" },
    });
  });

  test("runClientSetupWizard refuses to convert an existing server profile (rerun=false)", async () => {
    const profile = "main";
    const profileDir = path.join(tmpRoot, ".taskmanager", "profiles", profile);
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      path.join(profileDir, "config.json"),
      JSON.stringify({
        role: "server",
        port: 3001,
        data_dir: path.join(profileDir, "data"),
        auth_dir: path.join(profileDir, "auth"),
        bind_address: "127.0.0.1",
      }),
      "utf8",
    );

    await expect(
      runClientSetupWizard({ profile, rerun: false }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
