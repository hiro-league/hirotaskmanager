import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { authMiddleware, requireWebSession, type AppBindings } from "./auth";
import { cliBoardReadError } from "./cliPolicyGuard";
import { getDb, runMigrations } from "./db";
import { createBoardEventsResponse } from "./events";
import { authRoute } from "./routes/auth";
import { cliGlobalPolicyRoute } from "./routes/cliGlobalPolicy";
import { boardsRoute } from "./routes/boards";
import { notificationsRoute } from "./routes/notifications";
import { searchRoute } from "./routes/search";
import { statusesRoute } from "./routes/statuses";
import { ensureDataDir, entryByIdOrSlug } from "./storage";

/** Startup: ensure data dir → open/create SQLite → apply migrations. */
await ensureDataDir();
getDb();
runMigrations();

const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 3001;

const app = new Hono<AppBindings>();

// Dev-only CORS so the Vite app (another origin) can open EventSource directly to this API.
// Vite's /api proxy does not reliably keep an SSE connection registered on Bun (see useBoardChangeStream).
if (!isProd) {
  app.use(
    "/api/*",
    cors({
      // Keep dev auth close to production by allowing credentialed localhost SSE/fetch
      // instead of introducing a dev-only auth bypass.
      origin: (origin) => origin ?? "http://localhost:5173",
      credentials: true,
    }),
  );
}

app.use("/api/*", authMiddleware);
app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/events", async (c) => {
  const rawBoardId = c.req.query("boardId");
  if (rawBoardId != null && !/^\d+$/.test(rawBoardId)) {
    return c.json({ error: "Invalid boardId" }, 400);
  }
  const boardId = rawBoardId != null ? Number(rawBoardId) : null;
  if (boardId == null) {
    const blocked = requireWebSession(c);
    if (blocked) return blocked;
    return createBoardEventsResponse(boardId, c.req.raw.signal);
  }
  const entry = await entryByIdOrSlug(String(boardId));
  if (!entry) {
    return c.json({ error: "Board not found" }, 404);
  }
  const blocked = cliBoardReadError(c, entry);
  if (blocked) return blocked;
  return createBoardEventsResponse(boardId, c.req.raw.signal);
});
app.route("/api/auth", authRoute);
app.route("/api/cli-global-policy", cliGlobalPolicyRoute);
app.route("/api/statuses", statusesRoute);
app.route("/api/boards", boardsRoute);
app.route("/api/notifications", notificationsRoute);
app.route("/api/search", searchRoute);

if (isProd) {
  const distDir = path.resolve(import.meta.dir, "../..", "dist");

  app.use("/*", serveStatic({ root: distDir }));

  app.get("*", async () => {
    const file = Bun.file(path.join(distDir, "index.html"));
    return new Response(file, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });
}

const server = Bun.serve({
  port,
  fetch: app.fetch,
  // SSE keeps requests open by design, so raise the idle timeout above the
  // keepalive cadence instead of relying on Bun's shorter default.
  idleTimeout: 30,
});
console.log(
  `${isProd ? "Production" : "API"} server listening on http://localhost:${server.port}`,
);
