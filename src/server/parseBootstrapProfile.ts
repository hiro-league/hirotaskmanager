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

/** Reads `--port <n>` from argv for server bootstrap entrypoints (no port env var). */
export function parseBootstrapPortFromArgv(): number | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--port");
  if (i >= 0) {
    const next = argv[i + 1]?.trim();
    if (next) {
      const parsed = Number(next);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
  }
  const eq = argv.find((a) => a.startsWith("--port="));
  if (eq) {
    const parsed = Number(eq.slice("--port=".length).trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}
