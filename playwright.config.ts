import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { DEV_DEFAULT_PORT } from "./src/shared/ports";

/**
 * Disposable auth/data for the dev API when Playwright starts `npm run dev`.
 * Writes `~/.taskmanager/profiles/dev/config.json` under a temp HOME so
 * `resolveDataDir` / `resolveAuthDir` isolate SQLite + auth from your real profile.
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
const authDir = path.join(e2eScratch, "auth");
mkdirSync(dataDir, { recursive: true });
mkdirSync(authDir, { recursive: true });

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
      auth_dir: authDir,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

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
    },
  },
});
