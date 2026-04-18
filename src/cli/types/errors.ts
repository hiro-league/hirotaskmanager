/**
 * CLI error contract: stable `code` strings and `CliError` for stderr JSON / exit codes.
 * User-facing catalog: Hiro docs → Task Manager → hirotm errors.
 */

export const CLI_ERR = {
  badRequest: "bad_request",
  conflictingClearWithInput: "conflicting_clear_with_input",
  /** User answered “no” at an interactive confirmation prompt. */
  confirmationDeclined: "confirmation_declined",
  /** Non-interactive stdin (or missing TTY) without `-y` / `--yes` on a guarded mutation. */
  confirmationRequired: "confirmation_required",
  conflict: "conflict",
  fileNotFound: "file_not_found",
  conflictingInputSources: "conflicting_input_sources",
  emojiValidation: "emoji_validation_failed",
  forbidden: "forbidden",
  httpError: "http_error",
  internalError: "internal_error",
  /** Profile `config.json` or top-level `~/.taskmanager/config.json` violates schema or role rules. */
  invalidConfig: "invalid_config",
  /** Arguments or profile role incompatible with the command (e.g. server start on a client profile). */
  invalidArgs: "invalid_args",
  invalidJson: "invalid_json",
  invalidInputShape: "invalid_input_shape",
  invalidValue: "invalid_value",
  missingRequired: "missing_required",
  mutuallyExclusiveOptions: "mutually_exclusive_options",
  notFound: "not_found",
  noUpdateFields: "no_update_fields",
  rateLimited: "rate_limited",
  releaseNotFoundByName: "release_not_found_by_name",
  requestTimeout: "request_timeout",
  responseInconsistent: "response_inconsistent",
  serverExited: "server_exited",
  serverStartTimeout: "server_start_timeout",
  serverUnreachable: "server_unreachable",
  signalFailed: "signal_failed",
  stalePid: "stale_pid",
  noManagedServer: "no_managed_server",
  unauthenticated: "unauthenticated",
  versionMismatch: "version_mismatch",
} as const;

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
