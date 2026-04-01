export class CliError extends Error {
  details?: Record<string, unknown>;
  exitCode: number;

  constructor(
    message: string,
    exitCode = 1,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printError(
  message: string,
  exitCode = 1,
  details?: Record<string, unknown>,
): never {
  process.stderr.write(
    `${JSON.stringify({ error: message, ...details }, null, 2)}\n`,
  );
  process.exit(exitCode);
}

export function exitWithError(error: unknown): never {
  if (error instanceof CliError) {
    printError(error.message, error.exitCode, error.details);
  }

  if (error instanceof Error) {
    printError(error.message, 1);
  }

  printError("Unknown CLI error", 1);
}
