type SseHubSubscriber = {
  send(chunk: Uint8Array): void;
  close(): void;
};

type SseSend = (chunk: Uint8Array) => void;
type SseClose = () => void;

const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Hint for reverse proxies (and some dev proxies) not to buffer the stream.
  "X-Accel-Buffering": "no",
} as const;

export function createSseHub<S extends SseHubSubscriber>() {
  const subscribers = new Set<S>();
  const encoder = new TextEncoder();
  const KEEPALIVE_CHUNK = encoder.encode(": keepalive\n\n");
  const CONNECTED_CHUNK = encoder.encode(": connected\n\n");

  function encodeSseEvent(kind: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function broadcast(chunk: Uint8Array, filter?: (subscriber: S) => boolean): void {
    for (const subscriber of [...subscribers]) {
      if (filter && !filter(subscriber)) continue;
      try {
        subscriber.send(chunk);
      } catch {
        subscriber.close();
      }
    }
  }

  function createSseResponse(
    makeSubscriber: (send: SseSend, close: SseClose) => S,
    signal?: AbortSignal,
  ): Response {
    let cleanup: (() => void) | null = null;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          let keepalive: ReturnType<typeof setInterval> | null = null;
          let subscriber: S | null = null;
          const handleAbort = () => cleanup?.();

          cleanup = () => {
            if (closed) return;
            closed = true;
            if (keepalive) clearInterval(keepalive);
            if (subscriber) subscribers.delete(subscriber);
            if (signal) signal.removeEventListener("abort", handleAbort);
            try {
              controller.close();
            } catch {
              /* stream already closed */
            }
          };

          const send: SseSend = (chunk) => {
            if (closed) return;
            controller.enqueue(chunk);
          };

          subscriber = makeSubscriber(send, cleanup);
          subscribers.add(subscriber);
          if (signal) signal.addEventListener("abort", handleAbort, { once: true });

          // Send an initial comment so EventSource settles immediately.
          send(CONNECTED_CHUNK);

          // Keep the SSE connection warm well before Bun's idle timeout so the
          // stream stays open across long-lived sessions.
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
      { headers: SSE_RESPONSE_HEADERS },
    );
  }

  return { subscribers, broadcast, encodeSseEvent, createSseResponse };
}
