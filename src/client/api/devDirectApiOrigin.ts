/**
 * EventSource and other direct-to-Bun calls must bypass Vite's HTTP proxy (SSE subscriptions
 * do not stay alive through it). The port must match `vite.config.ts` server.proxy `/api`
 * target and `getDefaultPort({ kind: "dev" })` in `runtimeConfig.ts` (currently 3002).
 *
 * Previously this logic used 3001 (installed default), which breaks `npm run dev` where the
 * API listens on 3002 — especially visible as empty/failed requests in Safari Web Inspector.
 */
export const DEV_DIRECT_API_PORT = 3002;

export function devDirectApiOrigin(): string {
  if (typeof window === "undefined") {
    return `http://127.0.0.1:${DEV_DIRECT_API_PORT}`;
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${DEV_DIRECT_API_PORT}`;
}
