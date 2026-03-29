import { Hono } from "hono";
import { boardsRoute } from "./routes/boards";
import { ensureDataDirs } from "./storage";

await ensureDataDirs();

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/boards", boardsRoute);

const port = Number(process.env.PORT ?? 3001);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`API listening on http://localhost:${server.port}`);
