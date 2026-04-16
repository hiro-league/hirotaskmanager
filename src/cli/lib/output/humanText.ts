import { ansi } from "./ansi";

/**
 * Flatten nested objects into `path.to.key: value` lines for `human` success output.
 */
export function linesForHumanObject(obj: unknown, prefix = ""): string[] {
  const lines: string[] = [];
  if (obj === null || obj === undefined) {
    lines.push(`${ansi.dim}${prefix || "value"}:${ansi.reset} ${String(obj)}`);
    return lines;
  }
  if (Array.isArray(obj)) {
    lines.push(
      `${ansi.dim}${prefix || "value"}:${ansi.reset} ${JSON.stringify(obj)}`,
    );
    return lines;
  }
  if (typeof obj !== "object") {
    lines.push(`${ansi.dim}${prefix || "value"}:${ansi.reset} ${String(obj)}`);
    return lines;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      lines.push(...linesForHumanObject(v, path));
    } else {
      const valStr =
        v === null || v === undefined
          ? String(v)
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
      lines.push(`${ansi.dim}${path}:${ansi.reset} ${valStr}`);
    }
  }
  return lines;
}

export function writeHumanStdoutObject(data: unknown): void {
  process.stdout.write(`${linesForHumanObject(data).join("\n")}\n`);
}

/** stderr human errors: message + detail fields (same keys agents see in JSON). */
export function writeHumanStderrError(
  message: string,
  details?: Record<string, unknown>,
): void {
  const lines: string[] = [
    `${ansi.red}${ansi.bold}Error:${ansi.reset} ${message}`,
  ];
  if (details) {
    for (const [k, v] of Object.entries(details)) {
      const s =
        v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
      lines.push(`${ansi.dim}${k}:${ansi.reset} ${s}`);
    }
  }
  process.stderr.write(`${lines.join("\n")}\n`);
}
