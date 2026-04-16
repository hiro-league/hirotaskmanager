import type { BoardEvent } from "../shared/boardEvents";
import type { NotificationCreatedEvent } from "../shared/notifications";
import { createSseHub } from "./lib/sseHub";

type BoardEventSubscriber = {
  boardId: number | null;
  send: (chunk: Uint8Array) => void;
  close: () => void;
};

const boardEventsHub = createSseHub<BoardEventSubscriber>();

/** Broadcast board writes so open browser tabs can refetch without polling. */
export function publishBoardEvent(event: BoardEvent): void {
  const chunk = boardEventsHub.encodeSseEvent(event.kind, event);
  boardEventsHub.broadcast(chunk, (subscriber) => {
    // Index-level changes must reach every tab (sidebar board list), including
    // board-scoped SSE connections that filter by active board id.
    const isIndex = event.kind === "board-index-changed";
    return (
      isIndex ||
      subscriber.boardId === null ||
      subscriber.boardId === event.boardId
    );
  });
}

/** Broadcast notification-created to ALL SSE subscribers (every tab needs it). */
export function publishNotificationToAllSubscribers(event: NotificationCreatedEvent): void {
  const chunk = boardEventsHub.encodeSseEvent(event.kind, event);
  boardEventsHub.broadcast(chunk);
}

/** Use a generic invalidation event when a structural write is simpler than partial patching. */
export function publishBoardChanged(
  boardId: number,
  boardUpdatedAt: string,
): void {
  publishBoardEvent({ kind: "board-changed", boardId, boardUpdatedAt });
}

/** Sidebar / `GET /api/boards` index changed (not every `board-changed` — tasks bump that too). */
export function publishBoardIndexChanged(): void {
  publishBoardEvent({ kind: "board-index-changed" });
}

/** Keep one SSE stream per tab so browser clients can hear about external writes. */
export function createBoardEventsResponse(
  boardId: number | null,
  signal?: AbortSignal,
): Response {
  return boardEventsHub.createSseResponse(
    (send, close) => ({ boardId, send, close }),
    signal,
  );
}
