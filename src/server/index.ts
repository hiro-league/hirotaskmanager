import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { getDb, runMigrations } from "./db";
import { createBoardEventsResponse } from "./events";
import { boardsRoute } from "./routes/boards";
import { notificationsRoute } from "./routes/notifications";
import { searchRoute } from "./routes/search";
import { statusesRoute } from "./routes/statuses";
import { ensureDataDir } from "./storage";

/** Startup: ensure data dir → open/create SQLite → apply migrations. */
await ensureDataDir();
getDb();
runMigrations();

const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 3001;

const app = new Hono();

// Dev-only CORS so the Vite app (another origin) can open EventSource directly to this API.
// Vite's /api proxy does not reliably keep an SSE connection registered on Bun (see useBoardChangeStream).
if (!isProd) {
  app.use(
    "/api/*",
    cors({
      origin: (origin) => origin ?? "*",
    }),
  );
}

app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/events", (c) => {
  const rawBoardId = c.req.query("boardId");
  if (rawBoardId != null && !/^\d+$/.test(rawBoardId)) {
    return c.json({ error: "Invalid boardId" }, 400);
  }
  const boardId = rawBoardId != null ? Number(rawBoardId) : null;
  return createBoardEventsResponse(boardId, c.req.raw.signal);
});
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
