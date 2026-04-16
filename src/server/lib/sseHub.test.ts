import { describe, expect, test } from "bun:test";
import { createSseHub } from "./sseHub";

type TestSubscriber = {
  id: string;
  send(chunk: Uint8Array): void;
  close(): void;
};

const decoder = new TextDecoder();

describe("createSseHub", () => {
  test("encodes SSE events with event name and JSON body", () => {
    const hub = createSseHub<TestSubscriber>();
    const chunk = hub.encodeSseEvent("task-created", {
      kind: "task-created",
      taskId: 1,
    });

    expect(decoder.decode(chunk)).toBe(
      'event: task-created\ndata: {"kind":"task-created","taskId":1}\n\n',
    );
  });

  test("broadcast supports per-subscriber filters and closes failed sends", () => {
    const hub = createSseHub<TestSubscriber>();
    const received: string[] = [];
    let closedFailedSubscriber = false;
    let filteredSendCount = 0;

    const includedSubscriber: TestSubscriber = {
      id: "included",
      send(chunk) {
        received.push(decoder.decode(chunk));
      },
      close() {},
    };
    const failedSubscriber: TestSubscriber = {
      id: "failed",
      send() {
        throw new Error("boom");
      },
      close() {
        closedFailedSubscriber = true;
        hub.subscribers.delete(failedSubscriber);
      },
    };
    const filteredSubscriber: TestSubscriber = {
      id: "filtered",
      send() {
        filteredSendCount += 1;
      },
      close() {},
    };

    hub.subscribers.add(includedSubscriber);
    hub.subscribers.add(failedSubscriber);
    hub.subscribers.add(filteredSubscriber);

    hub.broadcast(hub.encodeSseEvent("board-changed", { boardId: 7 }), (subscriber) =>
      subscriber.id !== "filtered",
    );

    expect(received).toEqual([
      'event: board-changed\ndata: {"boardId":7}\n\n',
    ]);
    expect(closedFailedSubscriber).toBe(true);
    expect(filteredSendCount).toBe(0);
  });

  test("creates SSE responses with connected prelude and cleanup on cancel", async () => {
    const hub = createSseHub<TestSubscriber>();
    const response = hub.createSseResponse((send, close) => ({
      id: "stream",
      send,
      close,
    }));

    expect(response.headers.get("Content-Type")).toBe(
      "text/event-stream; charset=utf-8",
    );

    const reader = response.body!.getReader();
    const firstChunk = await reader.read();

    expect(decoder.decode(firstChunk.value)).toBe(": connected\n\n");
    expect(hub.subscribers.size).toBe(1);

    await reader.cancel();

    expect(hub.subscribers.size).toBe(0);
  });
});
