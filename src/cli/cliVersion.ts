/**
 * Single source for the npm package version used by the CLI (--version and help).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));

function readCliPackageVersion(): string {
  try {
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === "string" && pkg.version.length > 0
      ? pkg.version
      : "unknown";
  } catch (err) {
    // Never block CLI startup on missing/malformed package.json (e.g. odd test layouts).
    console.error(
      "[hirotm] Could not read package version from package.json:",
      err instanceof Error ? err.message : err,
    );
    return "unknown";
  }
}

export const CLI_PACKAGE_VERSION = readCliPackageVersion();
