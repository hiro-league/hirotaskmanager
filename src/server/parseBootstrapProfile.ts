/**
 * Reads `--profile <name>` from argv for server bootstrap entrypoints.
 * Parent CLIs pass the resolved profile this way instead of any profile env var.
 */
export function parseBootstrapProfileFromArgv(): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--profile");
  if (i >= 0) {
    const next = argv[i + 1]?.trim();
    if (next) return next;
  }
  const eq = argv.find((a) => a.startsWith("--profile="));
  if (eq) {
    const v = eq.slice("--profile=".length).trim();
    if (v) return v;
  }
  return undefined;
}

/** Reads `--dev` flag from argv for server bootstrap entrypoints. */
export function parseBootstrapDevFlagFromArgv(): boolean {
  return process.argv.slice(2).includes("--dev");
}
