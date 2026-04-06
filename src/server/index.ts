import { existsSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import {
  resolvePort,
  setRuntimeConfigSelection,
  type RuntimeKind,
} from "../shared/runtimeConfig";
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

export function createTaskManagerApp(kind: RuntimeKind): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // Keep dev auth close to production, but allow the Vite origin to talk to the
  // API directly for EventSource and fetch during local development.
  if (kind === "dev") {
    app.use(
      "/api/*",
      cors({
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

  if (kind === "installed") {
    const distDir = resolveInstalledDistDir();

    app.use("/*", serveStatic({ root: distDir }));

    app.get("*", async () => {
      const file = Bun.file(path.join(distDir, "index.html"));
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    });
  }

  return app;
}

function resolveInstalledDistDir(): string {
  return path.resolve(import.meta.dir, "../..", "dist");
}

function assertInstalledDistReady(): void {
  const distDir = resolveInstalledDistDir();
  const indexHtmlPath = path.join(distDir, "index.html");
  // Fail fast with a clear message so packaged installs and local release
  // checks never start a server that can only return 404s for the app shell.
  if (!existsSync(indexHtmlPath)) {
    throw new Error(
      `Built frontend not found at ${indexHtmlPath}. Run \`npm run build\` before starting the installed server.`,
    );
  }
}

export async function startTaskManagerServer(options: {
  kind: RuntimeKind;
  profile?: string;
}): Promise<ReturnType<typeof Bun.serve>> {
  setRuntimeConfigSelection({
    kind: options.kind,
    profile: options.profile,
  });

  await ensureDataDir();
  getDb();
  runMigrations();

  if (options.kind === "installed") {
    assertInstalledDistReady();
  }

  const app = createTaskManagerApp(options.kind);
  const server = Bun.serve({
    port: resolvePort({
      kind: options.kind,
      profile: options.profile,
    }),
    fetch: app.fetch,
    // SSE keeps requests open by design, so raise the idle timeout above the
    // keepalive cadence instead of relying on Bun's shorter default.
    idleTimeout: 30,
  });

  console.log(
    `${options.kind === "installed" ? "TaskManager" : "TaskManager dev API"} server listening on http://localhost:${server.port}`,
  );

  return server;
}
