import type { BoardEvent } from "../shared/boardEvents";

const encoder = new TextEncoder();
const KEEPALIVE_CHUNK = encoder.encode(": keepalive\n\n");
const CONNECTED_CHUNK = encoder.encode(": connected\n\n");

type BoardEventSubscriber = {
  boardId: number | null;
  send: (chunk: Uint8Array) => void;
  close: () => void;
};

const boardEventSubscribers = new Set<BoardEventSubscriber>();

function encodeBoardEvent(event: BoardEvent): Uint8Array {
  return encoder.encode(
    `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

/** Broadcast board writes so open browser tabs can refetch without polling. */
export function publishBoardEvent(event: BoardEvent): void {
  const chunk = encodeBoardEvent(event);
  for (const subscriber of [...boardEventSubscribers]) {
    if (subscriber.boardId !== null && subscriber.boardId !== event.boardId) continue;
    try {
      subscriber.send(chunk);
    } catch {
      subscriber.close();
    }
  }
}

/** Use a generic invalidation event when a structural write is simpler than partial patching. */
export function publishBoardChanged(
  boardId: number,
  boardUpdatedAt: string,
): void {
  publishBoardEvent({ kind: "board-changed", boardId, boardUpdatedAt });
}

/** Keep one SSE stream per tab so browser clients can hear about external writes. */
export function createBoardEventsResponse(
  boardId: number | null,
  signal?: AbortSignal,
): Response {
  let cleanup: (() => void) | null = null;
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let keepalive: ReturnType<typeof setInterval> | null = null;
        let subscriber: BoardEventSubscriber | null = null;
        const handleAbort = () => cleanup?.();

        cleanup = () => {
          if (closed) return;
          closed = true;
          if (keepalive) clearInterval(keepalive);
          if (subscriber) boardEventSubscribers.delete(subscriber);
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

        subscriber = { boardId, send, close: cleanup };
        boardEventSubscribers.add(subscriber);
        if (signal) signal.addEventListener("abort", handleAbort, { once: true });

        // Send an initial comment so EventSource settles immediately.
        send(CONNECTED_CHUNK);

        // Keep the SSE connection warm well before Bun's idle timeout so the
        // stream stays open across long-lived board sessions.
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
        // Hint for reverse proxies (and some dev proxies) not to buffer the stream.
        "X-Accel-Buffering": "no",
      },
    },
  );
}
