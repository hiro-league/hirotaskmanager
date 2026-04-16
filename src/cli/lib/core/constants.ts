/**
 * Central numeric defaults for hirotm CLI (see docs/cli-architecture-review.md §5).
 */
export const CLI_DEFAULTS = {
  MAX_PAGE_LIMIT: 500,
  DEFAULT_SEARCH_LIMIT: 20,
  API_FETCH_TIMEOUT_MS: 120_000,
  /** Max time to wait for `/api/health` after spawning a background or foreground server. */
  SERVER_START_WAIT_MS: 8_000,
  /** Deadline for health to go false after SIGTERM when stopping a managed server. */
  SERVER_STOP_WAIT_MS: 10_000,
  INSTALLED_DEFAULT_PORT: 3001,
} as const;

/** Short sleeps while polling health during server lifecycle. */
export const CLI_POLLING = {
  HEALTH_INTERVAL_MS: 250,
  FOREGROUND_PROGRESS_MS: 200,
  BACKGROUND_WAIT_MS: 300,
} as const;
