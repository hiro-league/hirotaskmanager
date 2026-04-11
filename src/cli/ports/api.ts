import type { ConfigOverrides } from "../types/config";

/**
 * HTTP boundary for the CLI: reads, JSON mutations, trash routes, and health checks.
 * Implemented by `adapters/http-api.ts` (delegates to `lib/api-client.ts`).
 */
export type ApiPort = {
  fetchApi: <T>(
    endpoint: string,
    overrides?: ConfigOverrides,
  ) => Promise<T>;
  fetchApiMutate: <T>(
    endpoint: string,
    init: {
      method: "POST" | "PATCH" | "PUT" | "DELETE";
      body?: unknown;
    },
    overrides?: ConfigOverrides,
  ) => Promise<T>;
  fetchApiTrashMutate: <T>(
    endpoint: string,
    init: { method: "POST" | "DELETE" },
    overrides?: ConfigOverrides,
  ) => Promise<T>;
  fetchHealth: (overrides?: ConfigOverrides) => Promise<boolean>;
};
