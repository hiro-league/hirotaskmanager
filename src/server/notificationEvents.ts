import type { NotificationCreatedEvent } from "../shared/notifications";
import { publishNotificationToAllSubscribers } from "./events";

const encoder = new TextEncoder();
const KEEPALIVE_CHUNK = encoder.encode(": keepalive\n\n");
const CONNECTED_CHUNK = encoder.encode(": connected\n\n");

type NotificationSubscriber = {
  send: (chunk: Uint8Array) => void;
  close: () => void;
};

const notificationSubscribers = new Set<NotificationSubscriber>();

function encodeNotificationEvent(event: NotificationCreatedEvent): Uint8Array {
  return encoder.encode(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
}

/** Broadcast newly created notification rows to all SSE subscribers.
 *  Sends to both the legacy `/api/notifications/events` subscribers AND the
 *  unified `/api/events` board-events stream so a single connection per tab
 *  can receive notifications without a separate EventSource. */
export function publishNotificationCreated(event: NotificationCreatedEvent): void {
  const chunk = encodeNotificationEvent(event);
  for (const subscriber of [...notificationSubscribers]) {
    try {
      subscriber.send(chunk);
    } catch {
      subscriber.close();
    }
  }
  // Pipe to the unified board-events stream — clients that use only
  // `/api/events` (single-connection mode) receive notifications here.
  publishNotificationToAllSubscribers(event);
}

/** Keep one notification SSE stream per open app shell so live feed/toasts need no polling. */
export function createNotificationEventsResponse(signal?: AbortSignal): Response {
  let cleanup: (() => void) | null = null;
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let keepalive: ReturnType<typeof setInterval> | null = null;
        let subscriber: NotificationSubscriber | null = null;
        const handleAbort = () => cleanup?.();

        cleanup = () => {
          if (closed) return;
          closed = true;
          if (keepalive) clearInterval(keepalive);
          if (subscriber) notificationSubscribers.delete(subscriber);
          if (signal) signal.removeEventListener("abort", handleAbort);
          try {
            controller.close();
          } catch {
            /* stream already closed */
          }
        };

        const send = (chunk: Uint8Array) => {
          if (closed) return;
          controller.enqueue(chunk);
        };

        subscriber = { send, close: cleanup };
        notificationSubscribers.add(subscriber);
        if (signal) signal.addEventListener("abort", handleAbort, { once: true });

        send(CONNECTED_CHUNK);
        keepalive = setInterval(() => {
          try {
            send(KEEPALIVE_CHUNK);
          } catch {
            cleanup?.();
          }
        }, 5_000);
      },
      cancel() {
        cleanup?.();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
