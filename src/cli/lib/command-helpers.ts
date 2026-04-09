import { Command } from "commander";
import { CliError, exitWithError } from "./output";

/** Shared Commander option helpers — Phase 1 CLI split from monolithic index.ts. */

export function addPortOption(command: Command): Command {
  return command
    .option("-p, --port <port>", "Port for the local TaskManager API")
    .option(
      "--client-name <name>",
      "Human-friendly client label sent with API requests (for notifications)",
    );
}

export function addProfileOption(command: Command): Command {
  return command.option(
    "--profile <name>",
    "Runtime profile name for this command",
  );
}

export function parsePortOption(port: string | undefined): number | undefined {
  if (!port?.trim()) return undefined;

  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError("Invalid port", 2, { port });
  }

  return parsed;
}

export function collectMultiValue(
  value: string,
  previous: string[] = [],
): string[] {
  return [
    ...previous,
    ...value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  ];
}

export function parseLimitOption(limit: string | undefined): number {
  if (limit == null || limit === "") return 20;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError("Invalid limit", 2, { limit });
  }
  return Math.min(50, n);
}

/** Wrap handler execution so Commander actions share one exit path (Phase 2). */
export async function withCliErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    exitWithError(error);
  }
}
