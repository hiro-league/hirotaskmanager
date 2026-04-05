import { Hono } from "hono";
import type { NotificationFeedSourceFilter } from "../../shared/notifications";
import { createNotificationEventsResponse } from "../notificationEvents";
import { listNotifications, markAllNotificationsRead } from "../storage/notifications";

function parseSourceFilter(raw: string | undefined): NotificationFeedSourceFilter {
  if (raw === "ui" || raw === "cli" || raw === "system" || raw === "all") {
    return raw;
  }
  return "all";
}

export const notificationsRoute = new Hono();

/** Phase 1: persisted feed + mark-all-read. Live SSE is Phase 3. */
notificationsRoute.get("/", (c) => {
  const scopeRaw = c.req.query("scope");
  const scope = scopeRaw === "board" ? "board" : "all";
  const boardIdRaw = c.req.query("boardId");
  const boardId =
    boardIdRaw != null && /^\d+$/.test(boardIdRaw) ? Number(boardIdRaw) : null;
  if (scope === "board" && boardId == null) {
    return c.json({ error: "boardId required when scope=board" }, 400);
  }

  const sourceFilter = parseSourceFilter(c.req.query("source"));

  let limit = Number(c.req.query("limit") ?? "50");
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  const page = listNotifications({
    scope,
    boardId: scope === "board" ? boardId : null,
    sourceFilter,
    limit,
  });
  return c.json(page);
});

notificationsRoute.patch("/read-all", (c) => {
  markAllNotificationsRead();
  return c.body(null, 204);
});

notificationsRoute.get("/events", (c) => {
  return createNotificationEventsResponse(c.req.raw.signal);
});
