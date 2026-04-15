import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HELP_FLAG = new Set(["-h", "--help"]);
const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// Build a clean env that strips Cursor/VS Code debug injection (case-insensitive on Windows).
const DEBUG_ENV_RE = /^(NODE_OPTIONS|VSCODE_INSPECTOR_OPTIONS)$/i;
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !DEBUG_ENV_RE.test(k)),
);

function run(command, args, cwd) {
  // Pipe stderr so we can surface the real error instead of losing it in debugger noise.
  // shell: true is required on Windows because Node >= 20 blocks .cmd/.bat via spawnSync
  // without it (CVE-2024-27980). cleanEnv strips the debug vars so shell mode is safe here.
  const result = spawnSync(command, args, {
    cwd,
    env: cleanEnv,
    stdio: ["inherit", "inherit", "pipe"],
    shell: process.platform === "win32",
  });

  if (result.error) {
    fail(`Failed to spawn ${executable}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    if (stderr) {
      console.error(stderr);
    }
    fail(`Command failed (exit ${result.status}): ${command} ${args.join(" ")}`);
  }
}

const extraArgs = process.argv.slice(2);

if (extraArgs.length > 0 && HELP_FLAG.has(extraArgs[0])) {
  console.log("Usage: npm run pack:install");
  console.log("");
  console.log("Packs the repo into packages/ and installs that tarball globally.");
  process.exit(0);
}

if (extraArgs.length > 0) {
  fail("This script does not take a target directory. It always packs from repo root and installs globally.");
}

const packageJsonPath = resolve(repoRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const packagesDirectory = resolve(repoRoot, "packages");
const tarballName = `${packageJson.name.replace(/^@/, "").replace(/\//g, "-")}-${packageJson.version}.tgz`;
const tarballPath = resolve(packagesDirectory, tarballName);

mkdirSync(packagesDirectory, { recursive: true });

// Remove the previous tarball so the install step always uses the package built by this run.
rmSync(tarballPath, { force: true });

console.log(`Packing ${packageJson.name}@${packageJson.version} into ${packagesDirectory}`);
run("npm", ["pack", "--pack-destination", packagesDirectory], repoRoot);

if (!existsSync(tarballPath)) {
  fail(`Packed tarball was not created: ${tarballPath}`);
}

// Global install avoids mutating this repo's package.json/package-lock with a self-dependency.
console.log(`Installing ${tarballName} globally`);
run("npm", ["install", "-g", tarballPath], repoRoot);

console.log("");
console.log(`Packed tarball: ${tarballPath}`);
console.log(`Installed globally: ${packageJson.name}`);
