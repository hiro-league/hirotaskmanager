import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getDb, runMigrations } from "./db";
import { importFromJsonIfNeeded } from "./import";
import { boardsRoute } from "./routes/boards";
import { statusesRoute } from "./routes/statuses";
import { ensureDataDir } from "./storage";

/**
 * Startup sequence (docs/sqlite_migration §5d):
 * ensure data dir → open/create SQLite → apply migrations → import legacy JSON if DB empty.
 */
await ensureDataDir();
getDb();
runMigrations();
await importFromJsonIfNeeded();

const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 3001;

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/statuses", statusesRoute);
app.route("/api/boards", boardsRoute);

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

const server = Bun.serve({ port, fetch: app.fetch });
console.log(
  `${isProd ? "Production" : "API"} server listening on http://localhost:${server.port}`,
);
