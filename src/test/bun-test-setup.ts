import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach } from "bun:test";
import { INSTALLED_DEFAULT_PORT } from "../shared/ports";
import { setRuntimeConfigSelection } from "../shared/runtimeConfig";

/**
 * Isolate unit tests from the developer's real ~/.taskmanager (Phase 1 requires
 * role + field validation on profile config.json).
 */
const testHome = mkdtempSync(path.join(tmpdir(), "tm-bun-test-"));
const defaultProfileDir = path.join(
  testHome,
  ".taskmanager",
  "profiles",
  "default",
);
mkdirSync(defaultProfileDir, { recursive: true });
writeFileSync(
  path.join(defaultProfileDir, "config.json"),
  `${JSON.stringify(
    {
      role: "server",
      port: INSTALLED_DEFAULT_PORT,
      data_dir: path.join(defaultProfileDir, "data"),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

beforeAll(() => {
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
});

/**
 * Simulate `hirotm --profile default` so resolvers do not depend on argv scanning.
 */
beforeEach(() => {
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  setRuntimeConfigSelection({ profile: "default" });
});
