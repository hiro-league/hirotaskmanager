import {
  TASK_MANAGER_CLIENT_HEADER,
  TASK_MANAGER_CLIENT_HIROTM,
  TASK_MANAGER_CLIENT_INSTANCE_HEADER,
  TASK_MANAGER_CLIENT_NAME_HEADER,
} from "../../shared/boardCliAccess";
import {
  TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1,
  TASK_MANAGER_MUTATION_RESPONSE_HEADER,
} from "../../shared/mutationResults";
import {
  getRuntimeCliClientInstanceId,
  getRuntimeCliClientName,
} from "./clientIdentity";
import { resolveApiKey, resolvePort, type ConfigOverrides } from "./config";
import { CliError } from "./output";

function taskManagerClientHeaders(): Record<string, string> {
  return {
    [TASK_MANAGER_CLIENT_HEADER]: TASK_MANAGER_CLIENT_HIROTM,
    [TASK_MANAGER_CLIENT_NAME_HEADER]: getRuntimeCliClientName(),
    [TASK_MANAGER_CLIENT_INSTANCE_HEADER]: getRuntimeCliClientInstanceId(),
  };
}

function buildBaseUrl(overrides: ConfigOverrides = {}): string {
  return `http://127.0.0.1:${resolvePort(overrides)}`;
}

function buildStartCommand(overrides: ConfigOverrides = {}): string {
  const command = ["hirotm", "start", "--background"];
  const port = resolvePort(overrides);

  // Include the resolved port so agents can recover with a copy/pasteable command.
  if (port !== 3001) {
    command.push("--port", String(port));
  }

  return command.join(" ");
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

export async function fetchApi<T>(
  endpoint: string,
  overrides: ConfigOverrides = {},
): Promise<T> {
  const baseUrl = buildBaseUrl(overrides);
  const apiKey = resolveApiKey();

  const headers: Record<string, string> = {
    ...taskManagerClientHeaders(),
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api${endpoint}`, {
      headers,
    });
  } catch {
    throw new CliError("Server not reachable", 1, {
      hint: `Run: ${buildStartCommand(overrides)}`,
      url: baseUrl,
    });
  }

  if (!response.ok) {
    const { message, extra } = await parseErrorResponse(response);
    throw new CliError(message, 1, {
      status: response.status,
      url: `${baseUrl}/api${endpoint}`,
      ...extra,
    });
  }

  return (await response.json()) as T;
}

export async function fetchApiMutate<T>(
  endpoint: string,
  init: { method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown },
  overrides: ConfigOverrides = {},
): Promise<T> {
  const baseUrl = buildBaseUrl(overrides);
  const apiKey = resolveApiKey();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [TASK_MANAGER_MUTATION_RESPONSE_HEADER]: TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1,
    ...taskManagerClientHeaders(),
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api${endpoint}`, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new CliError("Server not reachable", 1, {
      hint: `Run: ${buildStartCommand(overrides)}`,
      url: baseUrl,
    });
  }

  if (!response.ok) {
    const { message, extra } = await parseErrorResponse(response);
    throw new CliError(message, 1, {
      status: response.status,
      url: `${baseUrl}/api${endpoint}`,
      ...extra,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchHealth(overrides: ConfigOverrides = {}): Promise<boolean> {
  const baseUrl = buildBaseUrl(overrides);

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: taskManagerClientHeaders(),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}
