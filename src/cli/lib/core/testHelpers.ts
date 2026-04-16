/**
 * Shared helpers for CLI unit tests (not shipped).
 */

export async function captureStdout(run: () => Promise<void>): Promise<string> {
  let buf = "";
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: string | Uint8Array,
    ..._args: unknown[]
  ): boolean => {
    buf +=
      typeof chunk === "string"
        ? chunk
        : new TextDecoder().decode(chunk);
    return true;
  };
  try {
    await run();
  } finally {
    process.stdout.write = orig;
  }
  return buf;
}

export async function captureStderr(run: () => Promise<void>): Promise<string> {
  let buf = "";
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (
    chunk: string | Uint8Array,
    ..._args: unknown[]
  ): boolean => {
    buf +=
      typeof chunk === "string"
        ? chunk
        : new TextDecoder().decode(chunk);
    return true;
  };
  try {
    await run();
  } finally {
    process.stderr.write = orig;
  }
  return buf;
}
