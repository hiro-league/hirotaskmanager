import { setRuntimeCliClientName } from "../lib/client/clientIdentity";
import { setRuntimeCliPort, setRuntimeKind, setRuntimeProfile } from "../lib/core/config";

/**
 * Parse argv before Commander runs so profile and client name match this invocation
 * (same behavior as the former inline scan in index.ts).
 */
export function readClientNameArg(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--client-name") {
      const next = argv[index + 1];
      return typeof next === "string" ? next : undefined;
    }
    if (current.startsWith("--client-name=")) {
      return current.slice("--client-name=".length);
    }
  }
  return undefined;
}

export function readProfileArg(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--profile") {
      const next = argv[index + 1];
      return typeof next === "string" ? next : undefined;
    }
    if (current.startsWith("--profile=")) {
      return current.slice("--profile=".length);
    }
  }
  return undefined;
}

export function readPortArg(argv: string[]): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--port") {
      const next = argv[index + 1];
      if (typeof next === "string") {
        const parsed = Number(next);
        if (Number.isInteger(parsed) && parsed > 0) return parsed;
      }
    }
    if (current.startsWith("--port=")) {
      const parsed = Number(current.slice("--port=".length));
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

export function readDevFlag(argv: string[]): boolean {
  return argv.includes("--dev");
}

export function applyCliRuntimeFromArgv(argv: string[]): void {
  setRuntimeCliClientName(readClientNameArg(argv));
  setRuntimeProfile(readProfileArg(argv));
  setRuntimeCliPort(readPortArg(argv));
  if (readDevFlag(argv)) {
    setRuntimeKind("dev");
  }
}
