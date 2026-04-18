import {
  TASK_MANAGER_CLIENT_HEADER,
  TASK_MANAGER_CLIENT_HIROTM,
  TASK_MANAGER_CLIENT_INSTANCE_HEADER,
  TASK_MANAGER_CLIENT_NAME_HEADER,
} from "../../../shared/boardCliAccess";
import {
  TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1,
  TASK_MANAGER_MUTATION_RESPONSE_HEADER,
} from "../../../shared/mutationResults";
import {
  getRuntimeCliClientInstanceId,
  getRuntimeCliClientName,
} from "./clientIdentity";
import {
  resolveApiKey,
  resolveApiUrl,
  resolveProfileRole,
  type ConfigOverrides,
} from "../core/config";
import { CLI_DEFAULTS, CLI_POLLING } from "../core/constants";
import { CLI_ERR } from "../../types/errors";
import { mapHttpStatusToCliFailure } from "./cli-http-errors";
import { CliError } from "../output/output";
import type { RunningServerStatus } from "../../../shared/serverStatus";

/** Uses `CLI_DEFAULTS.API_FETCH_TIMEOUT_MS`; health polling uses short waits in `process.ts`. */
// Aligns with docs/cli-error-handling.md: timeouts surface as exit 7 + code request_timeout.
function apiFetchSignal(): AbortSignal {
  return AbortSignal.timeout(CLI_DEFAULTS.API_FETCH_TIMEOUT_MS);
}

function isFetchTimedOut(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  if (cause.name === "AbortError" || cause.name === "TimeoutError") {
    return true;
  }
  return (
    cause.message.includes("timed out") ||
    cause.message === "The operation was aborted."
  );
}

function taskManagerClientHeaders(): Record<string, string> {
  return {
    [TASK_MANAGER_CLIENT_HEADER]: TASK_MANAGER_CLIENT_HIROTM,
    [TASK_MANAGER_CLIENT_NAME_HEADER]: getRuntimeCliClientName(),
    [TASK_MANAGER_CLIENT_INSTANCE_HEADER]: getRuntimeCliClientInstanceId(),
  };
}

function authHeaders(overrides: ConfigOverrides): Record<string, string> {
  const apiKey = resolveApiKey(overrides);
  if (!apiKey) return {};
  return { Authorization: `Bearer ${apiKey}` };
}

/** True when URL host is loopback (CLI unreachable hints; design §2.4). */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function buildUnreachableHint(overrides: ConfigOverrides): string {
  const url = resolveApiUrl(overrides);
  let role: "server" | "client";
  try {
    role = resolveProfileRole(overrides);
  } catch {
    return `Server not reachable at ${url} — check profile config and that the API is running.`;
  }
  if (role === "server") {
    return `Server not reachable at ${url} — start it with: hirotaskmanager server start`;
  }
  if (isLoopbackUrl(url)) {
    return `Server not reachable at ${url} — make sure the local server is running (this client profile points at loopback, but does not manage it)`;
  }
  return `Server not reachable at ${url} — verify the remote server is running and the URL is correct`;
}

function buildBaseUrl(overrides: ConfigOverrides = {}): string {
  return resolveApiUrl(overrides).replace(/\/+$/, "");
}

async function parseErrorResponse(
  response: Response,
): Promise<{ message: string; extra: Record<string, unknown> }> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as Record<string, unknown>;
      const message =
        typeof body.error === "string"
          ? body.error
          : "Server error";
      const { error: _e, ...rest } = body;
      return { message, extra: rest as Record<string, unknown> };
    }

    const text = await response.text();
    return { message: text.trim() || "Server error", extra: {} };
  } catch {
    return { message: "Server error", extra: {} };
  }
}

/**
 * Single implementation for GET reads, JSON mutations, and trash POST/DELETE.
 * Keeps timeout/unreachable/HTTP error handling in one place (see docs/cli-architecture-review.md #1).
 */
type ApiRequestSpec =
  | { kind: "read" }
  | {
      kind: "mutate";
      method: "POST" | "PATCH" | "PUT" | "DELETE";
      body?: unknown;
    }
  | { kind: "trash"; method: "POST" | "DELETE" };

async function apiRequest<T>(
  endpoint: string,
  overrides: ConfigOverrides,
  spec: ApiRequestSpec,
): Promise<T> {
  const baseUrl = buildBaseUrl(overrides);

  const headers: Record<string, string> = {
    ...taskManagerClientHeaders(),
    ...authHeaders(overrides),
  };

  let method: string;
  let body: string | undefined;

  if (spec.kind === "read") {
    method = "GET";
    body = undefined;
  } else if (spec.kind === "mutate") {
    method = spec.method;
    headers["Content-Type"] = "application/json";
    headers[TASK_MANAGER_MUTATION_RESPONSE_HEADER] =
      TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1;
    body = spec.body !== undefined ? JSON.stringify(spec.body) : undefined;
  } else {
    method = spec.method;
    body = undefined;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api${endpoint}`, {
      method,
      headers,
      body,
      signal: apiFetchSignal(),
    });
  } catch (cause: unknown) {
    if (isFetchTimedOut(cause)) {
      throw new CliError("Request timed out", 7, {
        code: CLI_ERR.requestTimeout,
        retryable: true,
        url: baseUrl,
      });
    }
    throw new CliError("Server not reachable", 6, {
      code: CLI_ERR.serverUnreachable,
      hint: buildUnreachableHint(overrides),
      url: baseUrl,
      retryable: true,
    });
  }

  if (!response.ok) {
    const { message, extra } = await parseErrorResponse(response);
    const { exitCode, details } = mapHttpStatusToCliFailure(response.status, {
      ...extra,
      status: response.status,
      url: `${baseUrl}/api${endpoint}`,
    });
    throw new CliError(message, exitCode, details);
  }

  if (spec.kind !== "read" && response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type HealthStatus = RunningServerStatus;

export async function fetchApi<T>(
  endpoint: string,
  overrides: ConfigOverrides = {},
): Promise<T> {
  return apiRequest<T>(endpoint, overrides, { kind: "read" });
}

export async function fetchApiMutate<T>(
  endpoint: string,
  init: { method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown },
  overrides: ConfigOverrides = {},
): Promise<T> {
  return apiRequest<T>(endpoint, overrides, {
    kind: "mutate",
    method: init.method,
    body: init.body,
  });
}

/**
 * POST/DELETE to `/api/trash/...` without the board mutation entity header used by
 * `fetchApiMutate` — trash restore/purge are separate routes.
 */
export async function fetchApiTrashMutate<T>(
  endpoint: string,
  init: { method: "POST" | "DELETE" },
  overrides: ConfigOverrides = {},
): Promise<T> {
  return apiRequest<T>(endpoint, overrides, {
    kind: "trash",
    method: init.method,
  });
}

export async function fetchHealthStatus(
  overrides: ConfigOverrides = {},
): Promise<HealthStatus | null> {
  const baseUrl = buildBaseUrl(overrides);

  try {
    // Always pass a short abort signal: during launcher startup the port may
    // be occupied by an unrelated process (e.g. another dev server) that
    // accepts the TCP connection but never responds to /api/health. Without
    // this timeout the launcher's waitForHealth loop blocked forever instead
    // of failing fast with serverStartTimeout. Use a dedicated short timeout
    // here, not API_FETCH_TIMEOUT_MS (which is sized for real data calls).
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: {
        ...taskManagerClientHeaders(),
        ...authHeaders(overrides),
      },
      signal: AbortSignal.timeout(CLI_POLLING.HEALTH_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      pid?: unknown;
      port?: unknown;
      running?: unknown;
      runtime?: unknown;
      source?: unknown;
      url?: unknown;
    };
    if (
      typeof body.pid !== "number" ||
      typeof body.port !== "number" ||
      body.running !== true ||
      (body.runtime !== "dev" && body.runtime !== "installed") ||
      (body.source !== "repo" && body.source !== "installed") ||
      typeof body.url !== "string"
    ) {
      return null;
    }
    return {
      pid: body.pid,
      port: body.port,
      running: true,
      runtime: body.runtime,
      source: body.source,
      url: body.url,
    };
  } catch {
    return null;
  }
}

export async function fetchHealth(overrides: ConfigOverrides = {}): Promise<boolean> {
  return (await fetchHealthStatus(overrides))?.running === true;
}
