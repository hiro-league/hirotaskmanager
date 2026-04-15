import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BoardEvent } from "../../shared/boardEvents";
import type { NotificationCreatedEvent } from "../../shared/notifications";
import { mergeReleaseUpsertIntoList } from "../../shared/boardReleaseMerge";
import type { Board } from "../../shared/models";
import {
  boardDetailQueryKey,
  boardKeys,
  boardTaskDetailKey,
  fetchBoardList,
  fetchBoardTask,
  invalidateBoardStatsQueries,
} from "./queries";
import { invalidateNotificationQueries } from "./notifications";
import { getBrowserClientInstanceId } from "./clientHeaders";
import { devDirectApiOrigin } from "./devDirectApiOrigin";
import { useNotificationUiStore } from "@/store/notificationUi";

// ---------------------------------------------------------------------------
// Shared singleton EventSource with event-bus dispatch.
//
// One connection per tab.  All subscribers register callbacks on a central
// registry (not directly on the EventSource).  When the connection is replaced
// (e.g. upgrading from shell → board-scoped) the singleton re-attaches its
// dispatch listeners to the new EventSource — every subscriber's callbacks
// continue to fire without re-registration.
// ---------------------------------------------------------------------------

/** SSE event names the singleton dispatches. */
const SSE_EVENT_NAMES = [
  "board-index-changed",
  "notification-created",
  "board-changed",
  "release-upserted",
  "task-created",
  "task-updated",
  "task-deleted",
  "task-trashed",
  "task-purged",
  "task-restored",
  "list-created",
  "list-updated",
  "list-deleted",
  "list-trashed",
  "list-purged",
  "list-restored",
] as const;

type SseEventName = (typeof SSE_EVENT_NAMES)[number];
type SseCallback = (raw: Event) => void;

/** Per-event-name set of subscriber callbacks. */
const callbackRegistry = new Map<SseEventName, Set<SseCallback>>();

for (const name of SSE_EVENT_NAMES) {
  callbackRegistry.set(name, new Set());
}

let activeEs: EventSource | null = null;
let activeBoardId: number | null = null;
let activeRefCount = 0;

const SSE_OPEN_WARNING_MS = 8000;
const SSE_WARNING_THROTTLE_MS = 60_000;
let connectWarnTimer: ReturnType<typeof setTimeout> | null = null;
let lastSseConnectionWarningAt = 0;

function clearConnectWarnTimer(): void {
  if (connectWarnTimer != null) {
    clearTimeout(connectWarnTimer);
    connectWarnTimer = null;
  }
}

function maybeWarnSseConnectSlow(): void {
  const now = Date.now();
  if (now - lastSseConnectionWarningAt < SSE_WARNING_THROTTLE_MS) return;
  lastSseConnectionWarningAt = now;
  useNotificationUiStore.getState().pushSystemToast(
    "Live updates are slow to connect. Browsers allow only a few connections per site — many open tabs can block them. Close extra tabs to restore real-time updates.",
  );
}

function eventsUrl(boardId: number | null): string {
  const path =
    boardId != null ? `/api/events?boardId=${boardId}` : "/api/events";
  if (import.meta.env.PROD) return path;
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  const fallbackOrigin = devDirectApiOrigin();
  const origin =
    raw && raw.length > 0 ? raw.replace(/\/$/, "") : fallbackOrigin;
  return `${origin}${path}`;
}

/** Attach the singleton's dispatch listeners to an EventSource.  Each named
 *  event fans out to every callback in the registry for that name. */
function attachDispatchListeners(es: EventSource): void {
  for (const name of SSE_EVENT_NAMES) {
    const callbacks = callbackRegistry.get(name)!;
    es.addEventListener(name, (raw: Event) => {
      for (const cb of callbacks) {
        try {
          cb(raw);
        } catch (err) {
          console.error(`[sse-dispatch] error in ${name} handler`, err);
        }
      }
    });
  }
}

/** Open (or replace) the shared EventSource.  Attaches dispatch listeners to
 *  the new instance so all registered callbacks immediately receive events. */
function openConnection(boardId: number | null): void {
  clearConnectWarnTimer();
  if (activeEs) activeEs.close();

  const es = new EventSource(eventsUrl(boardId), { withCredentials: true });
  activeEs = es;
  activeBoardId = boardId;
  attachDispatchListeners(es);

  let opened = false;
  const onOpen = () => {
    opened = true;
    clearConnectWarnTimer();
    es.removeEventListener("open", onOpen);
  };
  es.addEventListener("open", onOpen);
  connectWarnTimer = setTimeout(() => {
    connectWarnTimer = null;
    if (!opened && activeEs === es) maybeWarnSseConnectSlow();
  }, SSE_OPEN_WARNING_MS);
}

/** Register a callback for a named SSE event. Returns an unsubscribe fn. */
function subscribe(name: SseEventName, cb: SseCallback): () => void {
  callbackRegistry.get(name)!.add(cb);
  return () => {
    callbackRegistry.get(name)!.delete(cb);
  };
}

/**
 * Acquire the singleton.  Board-scoped requests upgrade the connection;
 * shell requests (null) piggyback on whatever exists.
 */
function acquire(wantedBoardId: number | null): void {
  activeRefCount++;
  const needNew =
    activeEs == null ||
    (wantedBoardId != null && activeBoardId !== wantedBoardId);
  if (needNew) {
    // Prefer board-scoped when available.
    openConnection(wantedBoardId ?? activeBoardId);
  }
}

function release(): void {
  activeRefCount--;
  if (activeRefCount <= 0) {
    clearConnectWarnTimer();
    activeEs?.close();
    activeEs = null;
    activeBoardId = null;
    activeRefCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Debounced board invalidation
// ---------------------------------------------------------------------------

let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedInvalidateBoard(
  qc: QueryClient,
  routeKey: string | number | null,
  eventBoardId: number | null,
): void {
  if (eventBoardId == null) return;
  if (invalidateTimer != null) clearTimeout(invalidateTimer);
  invalidateTimer = setTimeout(() => {
    invalidateTimer = null;
    if (routeKey != null) {
      void qc.invalidateQueries({
        queryKey: [...boardKeys.all, routeKey],
        exact: true,
      });
    }
    if (routeKey !== eventBoardId) {
      void qc.invalidateQueries({
        queryKey: boardKeys.detail(eventBoardId),
        exact: true,
      });
    }
    invalidateBoardStatsQueries(qc, eventBoardId);
  }, 300);
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

/**
 * Single SSE connection per tab.  Handles board-change, board-index, and
 * notification events over one EventSource to stay within the browser's
 * per-origin HTTP/1.1 connection limit (6 in Chrome).
 *
 * Call sites:
 *   - `AppShell` → `useBoardChangeStream(null, null)` — shell-level
 *     (board-index + notifications).
 *   - `BoardView` → `useBoardChangeStream(routeId, resolvedId)` — adds
 *     board-scoped events on top.
 *
 * Both hooks register callbacks on a shared event bus.  When BoardView mounts
 * the connection upgrades to board-scoped but AppShell's callbacks (e.g.
 * notification-created) keep working because they live in the registry, not
 * on the old EventSource instance.
 */
export function useBoardChangeStream(
  routeBoardId: string | number | null,
  resolvedBoardId: number | null,
): void {
  const qc = useQueryClient();
  const routeKey = boardDetailQueryKey(routeBoardId);
  const eventBoardId =
    typeof routeKey === "number" ? routeKey : resolvedBoardId;

  const panelOpenRef = useRef(false);
  panelOpenRef.current = useNotificationUiStore((s) => s.panelOpen);
  const pushToastRef = useRef(useNotificationUiStore((s) => s.pushToast));
  pushToastRef.current = useNotificationUiStore((s) => s.pushToast);

  useEffect(() => {
    acquire(eventBoardId);

    const unsubs: (() => void)[] = [];
    const isShellLevel = eventBoardId == null;

    // Board-index and notification handlers are registered only by the
    // shell-level caller (AppShell, eventBoardId=null) to avoid duplicates
    // when both AppShell and BoardView are mounted simultaneously.
    if (isShellLevel) {
      unsubs.push(
        subscribe("board-index-changed", () => {
          void qc.invalidateQueries({ queryKey: boardKeys.all, exact: true });
        }),
      );

      const browserInstanceId = getBrowserClientInstanceId();
      unsubs.push(
        subscribe("notification-created", (raw) => {
          const event = JSON.parse(
            (raw as MessageEvent<string>).data,
          ) as NotificationCreatedEvent;
          invalidateNotificationQueries(qc);
          if (panelOpenRef.current) return;
          if (event.notification.clientInstanceId === browserInstanceId) return;
          const st = event.notification.sourceType;
          if (st !== "cli" && st !== "system") return;
          pushToastRef.current(event.notification);
        }),
      );
    }

    // --- board-detail handlers (active when viewing a board) ---
    const boardCacheKeys: ReadonlyArray<readonly unknown[]> =
      eventBoardId != null
        ? [
            ...(routeKey != null
              ? [[...boardKeys.all, routeKey] as const]
              : []),
            ...(routeKey !== eventBoardId
              ? [boardKeys.detail(eventBoardId)]
              : []),
          ]
        : [];

    const getCurrentBoard = (): Board | undefined => {
      for (const key of boardCacheKeys) {
        const current = qc.getQueryData<Board>(key);
        if (current) return current;
      }
      return undefined;
    };

    const setBoardCaches = (updater: (current: Board) => Board) => {
      for (const key of boardCacheKeys) {
        qc.setQueryData<Board>(key, (current) =>
          current ? updater(current) : current,
        );
      }
    };

    const invalidateBoard = () =>
      debouncedInvalidateBoard(qc, routeKey, eventBoardId);

    const isAlreadyApplied = (event: BoardEvent): boolean => {
      if (event.kind === "board-index-changed") return false;
      const current = getCurrentBoard();
      if (!current) return false;
      return current.updatedAt > event.boardUpdatedAt;
    };

    unsubs.push(
      subscribe("board-changed", (raw) => {
        const event = JSON.parse(
          (raw as MessageEvent<string>).data,
        ) as BoardEvent;
        if (event.kind !== "board-changed") return;
        invalidateBoard();
      }),
    );

    unsubs.push(
      subscribe("release-upserted", (raw) => {
        const event = JSON.parse(
          (raw as MessageEvent<string>).data,
        ) as BoardEvent;
        if (event.kind !== "release-upserted") return;
        if (!isAlreadyApplied(event)) {
          const current = getCurrentBoard();
          if (!current) {
            invalidateBoard();
            return;
          }
          setBoardCaches((b) => ({
            ...b,
            releases: mergeReleaseUpsertIntoList(b.releases, event.release),
            updatedAt: event.boardUpdatedAt,
          }));
        }
        invalidateBoardStatsQueries(qc, event.boardId);
      }),
    );

    unsubs.push(
      subscribe("task-created", onTaskCreatedOrUpdated),
      subscribe("task-updated", onTaskCreatedOrUpdated),
    );

    unsubs.push(
      subscribe("task-deleted", onTaskRemovedFromLiveBoard),
      subscribe("task-trashed", onTaskRemovedFromLiveBoard),
      subscribe("task-purged", onTaskRemovedFromLiveBoard),
    );

    unsubs.push(
      subscribe("list-created", onListCreatedOrUpdated),
      subscribe("list-updated", onListCreatedOrUpdated),
    );

    unsubs.push(
      subscribe("list-deleted", onListRemovedFromLiveBoard),
      subscribe("list-trashed", onListRemovedFromLiveBoard),
      subscribe("list-purged", onListRemovedFromLiveBoard),
    );

    unsubs.push(
      subscribe("task-restored", onTaskOrListRestored),
      subscribe("list-restored", onTaskOrListRestored),
    );

    // --- handler definitions (hoisted for subscribe calls above) ---

    function onTaskCreatedOrUpdated(raw: Event): void {
      const event = JSON.parse(
        (raw as MessageEvent<string>).data,
      ) as BoardEvent;
      if (event.kind !== "task-created" && event.kind !== "task-updated") {
        return;
      }
      if (isAlreadyApplied(event)) {
        invalidateBoard();
        return;
      }
      void (async () => {
        try {
          const task = await fetchBoardTask(event.boardId, event.taskId);
          qc.setQueryData(
            boardTaskDetailKey(event.boardId, event.taskId),
            task,
          );
          setBoardCaches((current) => {
            const exists = current.tasks.some(
              (item) => item.taskId === task.taskId,
            );
            return {
              ...current,
              tasks: exists
                ? current.tasks.map((item) =>
                    item.taskId === task.taskId ? task : item,
                  )
                : [...current.tasks, task],
              updatedAt: event.boardUpdatedAt,
            };
          });
          invalidateBoard();
        } catch {
          invalidateBoard();
        }
      })();
    }

    function onTaskRemovedFromLiveBoard(raw: Event): void {
      const event = JSON.parse(
        (raw as MessageEvent<string>).data,
      ) as BoardEvent;
      if (
        event.kind !== "task-deleted" &&
        event.kind !== "task-trashed" &&
        event.kind !== "task-purged"
      ) {
        return;
      }
      if (!isAlreadyApplied(event)) {
        setBoardCaches((current) => ({
          ...current,
          tasks: current.tasks.filter(
            (task) => task.taskId !== event.taskId,
          ),
          updatedAt: event.boardUpdatedAt,
        }));
      }
      invalidateBoard();
    }

    function onListCreatedOrUpdated(raw: Event): void {
      const event = JSON.parse(
        (raw as MessageEvent<string>).data,
      ) as BoardEvent;
      if (event.kind !== "list-created" && event.kind !== "list-updated") {
        return;
      }
      if (isAlreadyApplied(event)) {
        invalidateBoard();
        return;
      }
      void (async () => {
        try {
          const list = await fetchBoardList(event.boardId, event.listId);
          setBoardCaches((current) => {
            const exists = current.lists.some(
              (item) => item.listId === list.listId,
            );
            return {
              ...current,
              lists: exists
                ? current.lists.map((item) =>
                    item.listId === list.listId ? list : item,
                  )
                : [...current.lists, list],
              updatedAt: event.boardUpdatedAt,
            };
          });
          invalidateBoard();
        } catch {
          invalidateBoard();
        }
      })();
    }

    function onListRemovedFromLiveBoard(raw: Event): void {
      const event = JSON.parse(
        (raw as MessageEvent<string>).data,
      ) as BoardEvent;
      if (
        event.kind !== "list-deleted" &&
        event.kind !== "list-trashed" &&
        event.kind !== "list-purged"
      ) {
        return;
      }
      if (!isAlreadyApplied(event)) {
        setBoardCaches((current) => ({
          ...current,
          lists: current.lists.filter(
            (list) => list.listId !== event.listId,
          ),
          tasks: current.tasks.filter(
            (task) => task.listId !== event.listId,
          ),
          updatedAt: event.boardUpdatedAt,
        }));
      }
      invalidateBoard();
    }

    function onTaskOrListRestored(raw: Event): void {
      const event = JSON.parse(
        (raw as MessageEvent<string>).data,
      ) as BoardEvent;
      if (event.kind !== "task-restored" && event.kind !== "list-restored") {
        return;
      }
      invalidateBoard();
    }

    return () => {
      if (invalidateTimer != null) {
        clearTimeout(invalidateTimer);
        invalidateTimer = null;
      }
      for (const unsub of unsubs) unsub();
      release();
    };
  }, [eventBoardId, qc, routeKey]);
}
