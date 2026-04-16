import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Disposable auth/data for the dev API when Playwright starts `npm run dev`.
 * Uses existing runtime env vars (see `resolveDataDir` / `resolveAuthDir` in `src/shared/runtimeConfig.ts`).
 * Each Playwright process gets a fresh temp dir so passphrase-based UI login is deterministic.
 */
if (!process.env.TASKMANAGER_DATA_DIR || !process.env.TASKMANAGER_AUTH_DIR) {
  const e2eScratch = mkdtempSync(path.join(tmpdir(), "tm-e2e-"));
  mkdirSync(path.join(e2eScratch, "data"), { recursive: true });
  mkdirSync(path.join(e2eScratch, "auth"), { recursive: true });
  process.env.TASKMANAGER_DATA_DIR ??= path.join(e2eScratch, "data");
  process.env.TASKMANAGER_AUTH_DIR ??= path.join(e2eScratch, "auth");
}

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
    // Always spawn so TASKMANAGER_* dirs match this process (reuse would attach to a hand-run dev server on another DB).
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
