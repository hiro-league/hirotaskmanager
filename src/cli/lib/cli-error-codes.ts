/**
 * Stable `code` strings on stderr JSON for agents and scripts.
 * User-facing reference: Hiro docs → Task Manager → hirotm errors (Mintlify).
 */
export const CLI_ERR = {
  badRequest: "bad_request",
  conflictingClearWithInput: "conflicting_clear_with_input",
  conflict: "conflict",
  fileNotFound: "file_not_found",
  conflictingInputSources: "conflicting_input_sources",
  emojiValidation: "emoji_validation_failed",
  forbidden: "forbidden",
  httpError: "http_error",
  internalError: "internal_error",
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
