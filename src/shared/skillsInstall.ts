/**
 * Copies bundled skills/ from the installed package into ~/.taskmanager/skills/.
 * Used as a safety net in the launcher when postinstall didn't run (e.g.
 * --ignore-scripts, CI).  The postinstall-message.mjs script has equivalent
 * plain-Node logic that runs at npm/bun install time.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { getTaskManagerHomeDir } from "./runtimeConfig";

function getPackageRoot(): string {
  return path.resolve(import.meta.dir, "../..");
}

function getPackageVersion(): string {
  try {
    const pkgPath = path.join(getPackageRoot(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return (pkg.version as string) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Ensure ~/.taskmanager/skills/ is populated and up to date with the bundled
 * skills shipped inside the npm package.  Replaces stale copies when the
 * package version changes.
 *
 * @returns `true` when the skills directory is present and current.
 */
export function ensureBundledSkills(): boolean {
  const bundledDir = path.join(getPackageRoot(), "skills");
  if (!existsSync(bundledDir)) return false;

  const homeDir = getTaskManagerHomeDir();
  const targetDir = path.join(homeDir, "skills");
  const stampFile = path.join(homeDir, ".skills-version");

  const currentVersion = getPackageVersion();
  let existingVersion = "";
  try {
    existingVersion = readFileSync(stampFile, "utf8").trim();
  } catch { /* missing or unreadable — treat as stale */ }

  if (existingVersion === currentVersion && existsSync(targetDir)) {
    return true;
  }

  try {
    mkdirSync(homeDir, { recursive: true });

    // Full replace so renamed/deleted skill files don't linger.
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }

    cpSync(bundledDir, targetDir, { recursive: true });
    writeFileSync(stampFile, currentVersion + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}
