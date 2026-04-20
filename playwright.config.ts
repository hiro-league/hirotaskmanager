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
 * Playwright resolves browser binaries under `$HOME/.cache/ms-playwright`. We still
 * override HOME for app isolation, so pin the browsers path to the real user cache
 * (or CI install path) before mutating HOME — otherwise `npx playwright install`
 * and test runs disagree (e.g. GitHub Actions).
 */
const playwrightBrowsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ??
  path.join(homedir(), ".cache", "ms-playwright");

const e2eScratch = mkdtempSync(path.join(tmpdir(), "tm-e2e-"));
const dataDir = path.join(e2eScratch, "data");
mkdirSync(dataDir, { recursive: true });

const e2eHome = path.join(e2eScratch, "home");
const devProfileDir = path.join(e2eHome, ".taskmanager", "profiles", "dev");
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

process.env.HOME = e2eHome;
process.env.USERPROFILE = e2eHome;
process.env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersPath;

// Task #31338: mint the bootstrap setup token before the dev server starts so
// `ensureWebSession` can submit the first-time passphrase form. The dev
// server (`npm run dev`) does not run through the launcher, so nothing else
// would create the sidecar in this code path. We capture the raw token to a
// file the helper reads (the on-disk sidecar only stores the SHA-256 hash).
const e2eAuthDir = path.join(devProfileDir, "auth");
mkdirSync(e2eAuthDir, { recursive: true });
const e2eSetupToken = await mintSetupToken(e2eAuthDir);
const e2eSetupTokenFile = path.join(e2eScratch, "e2e-setup-token.txt");
writeFileSync(e2eSetupTokenFile, e2eSetupToken, "utf8");
process.env.HIROTM_E2E_SETUP_TOKEN_FILE = e2eSetupTokenFile;

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
      HIROTM_E2E_SETUP_TOKEN_FILE: e2eSetupTokenFile,
    },
  },
});
