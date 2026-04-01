import { resolveApiKey, resolvePort, type ConfigOverrides } from "./config";
import { CliError } from "./output";

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

async function parseErrorBody(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === "string" ? body.error : undefined;
    }

    const text = await response.text();
    return text.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function fetchApi<T>(
  endpoint: string,
  overrides: ConfigOverrides = {},
): Promise<T> {
  const baseUrl = buildBaseUrl(overrides);
  const apiKey = resolveApiKey();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api${endpoint}`, {
      headers: apiKey
        ? {
            Authorization: `Bearer ${apiKey}`,
          }
        : undefined,
    });
  } catch {
    throw new CliError("Server not reachable", 1, {
      hint: `Run: ${buildStartCommand(overrides)}`,
      url: baseUrl,
    });
  }

  if (!response.ok) {
    const serverMessage = await parseErrorBody(response);
    throw new CliError(serverMessage ?? "Server error", 1, {
      status: response.status,
      url: `${baseUrl}/api${endpoint}`,
    });
  }

  return (await response.json()) as T;
}

export async function fetchHealth(overrides: ConfigOverrides = {}): Promise<boolean> {
  const baseUrl = buildBaseUrl(overrides);

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}
