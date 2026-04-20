import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { DEV_DEFAULT_PORT } from "./src/shared/ports";
import { mintSetupToken } from "./src/server/setupToken";

/**
 * Disposable auth/data for the dev API when Playwright starts `npm run dev`.
 * Writes `~/.taskmanager/profiles/dev/config.json` under a temp HOME so
 * `resolveDataDir` / `resolveAuthDir` isolate SQLite + auth from your real profile.
 *
 * Auth always lives under `<profileRoot>/auth` (no longer overridable via
 * config.auth_dir), so we only need to override HOME here — the runtime will
 * derive the auth dir from the temp HOME automatically.
 *
 * Playwright's default browsers path is platform-specific:
 *   - Windows: `%LOCALAPPDATA%\ms-playwright`
 *   - macOS:   `~/Library/Caches/ms-playwright`
 *   - Linux:   `~/.cache/ms-playwright`
 * We still override HOME for app isolation, so pin the browsers path to the
 * real user cache (or CI install path) before mutating HOME — otherwise
 * `npx playwright install` and test runs disagree (e.g. GitHub Actions).
 */
function defaultPlaywrightBrowsersPath(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error(
        "LOCALAPPDATA env var is required on Windows to locate the Playwright browsers cache",
      );
    }
    return path.join(localAppData, "ms-playwright");
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Caches", "ms-playwright");
  }
  return path.join(homedir(), ".cache", "ms-playwright");
}

const playwrightBrowsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ?? defaultPlaywrightBrowsersPath();

/**
 * Playwright loads this config in BOTH the runner process and each worker
 * process. Without a guard, `mkdtempSync` + `mintSetupToken` re-run in the
 * worker and overwrite the sidecar with a fresh token while the dev server
 * (started by the runner) still references the original sidecar — every
 * `setupPassphrase` call then 401s with `auth_invalid_setup_token`.
 *
 * Use `HIROTM_E2E_SCRATCH_DIR` as the load-once latch: the runner creates a
 * scratch dir and exports its path; child processes (workers, webServer) see
 * the env var and reuse the existing dir + sidecar instead of minting a
 * conflicting one.
 */
const existingScratch = process.env.HIROTM_E2E_SCRATCH_DIR;
const e2eScratch =
  existingScratch ?? mkdtempSync(path.join(tmpdir(), "tm-e2e-"));
const dataDir = path.join(e2eScratch, "data");
const e2eHome = path.join(e2eScratch, "home");
const devProfileDir = path.join(e2eHome, ".taskmanager", "profiles", "dev");
const e2eAuthDir = path.join(devProfileDir, "auth");
const e2eSetupTokenFile = path.join(e2eScratch, "e2e-setup-token.txt");

if (!existingScratch) {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(devProfileDir, { recursive: true });
  writeFileSync(
    path.join(devProfileDir, "config.json"),
    `${JSON.stringify(
      {
        role: "server",
        port: DEV_DEFAULT_PORT,
        data_dir: dataDir,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // Task #31338: mint the bootstrap setup token before the dev server starts
  // so `ensureWebSession` can submit the first-time passphrase form. The dev
  // server (`npm run dev`) does not run through the launcher, so nothing else
  // would create the sidecar in this code path. We capture the raw token to
  // a file the helper reads (the on-disk sidecar only stores the SHA-256
  // hash).
  mkdirSync(e2eAuthDir, { recursive: true });
  const e2eSetupToken = await mintSetupToken(e2eAuthDir);
  writeFileSync(e2eSetupTokenFile, e2eSetupToken, "utf8");
}

process.env.HIROTM_E2E_SCRATCH_DIR = e2eScratch;
process.env.HIROTM_E2E_SETUP_TOKEN_FILE = e2eSetupTokenFile;
process.env.HOME = e2eHome;
process.env.USERPROFILE = e2eHome;
process.env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersPath;

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker avoids shared SQLite + auth races across journey specs.
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: e2eHome,
      USERPROFILE: e2eHome,
      PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
      HIROTM_E2E_SCRATCH_DIR: e2eScratch,
      HIROTM_E2E_SETUP_TOKEN_FILE: e2eSetupTokenFile,
    },
  },
});
