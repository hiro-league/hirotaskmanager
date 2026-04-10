/**
 * Runs opt-in CLI integration tests with RUN_CLI_REAL_STACK set (cross-platform).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const proc = Bun.spawn({
  cmd: ["bun", "test", "./src/cli/subprocess.real-stack.test.ts"],
  cwd: repoRoot,
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, RUN_CLI_REAL_STACK: "1" },
});

const code = await proc.exited;
process.exit(code);
