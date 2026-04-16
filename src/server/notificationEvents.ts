import type { NotificationCreatedEvent } from "../shared/notifications";
import { publishNotificationToAllSubscribers } from "./events";
import { createSseHub } from "./lib/sseHub";

type NotificationSubscriber = {
  send: (chunk: Uint8Array) => void;
  close: () => void;
};

const notificationEventsHub = createSseHub<NotificationSubscriber>();

/** Broadcast newly created notification rows to all SSE subscribers.
 *  Sends to both the legacy `/api/notifications/events` subscribers AND the
 *  unified `/api/events` board-events stream so a single connection per tab
 *  can receive notifications without a separate EventSource. */
export function publishNotificationCreated(event: NotificationCreatedEvent): void {
  const chunk = notificationEventsHub.encodeSseEvent(event.kind, event);
  notificationEventsHub.broadcast(chunk);
  // Pipe to the unified board-events stream — clients that use only
  // `/api/events` (single-connection mode) receive notifications here.
  publishNotificationToAllSubscribers(event);
}

/** Keep one notification SSE stream per open app shell so live feed/toasts need no polling. */
export function createNotificationEventsResponse(signal?: AbortSignal): Response {
  return notificationEventsHub.createSseResponse(
    (send, close) => ({ send, close }),
    signal,
  );
}
