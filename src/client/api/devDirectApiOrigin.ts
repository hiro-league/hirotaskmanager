import { DEV_DEFAULT_PORT } from "../../shared/ports";
import { buildLocalServerUrl } from "../../shared/serverStatus";

/**
 * EventSource and other direct-to-Bun calls must bypass Vite's HTTP proxy (SSE subscriptions
 * do not stay alive through it). The port is the shared `DEV_DEFAULT_PORT` used by
 * `getDefaultPort({ kind: "dev" })` in `shared/runtimeConfig.ts` and vite.config.ts proxy.
 */
export function devDirectApiOrigin(): string {
  if (typeof window === "undefined") {
    return buildLocalServerUrl(DEV_DEFAULT_PORT);
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${DEV_DEFAULT_PORT}`;
}
