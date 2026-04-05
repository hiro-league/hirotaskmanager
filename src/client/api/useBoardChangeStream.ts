import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardEvent } from "../../shared/boardEvents";
import type { Board } from "../../shared/models";
import {
  boardDetailQueryKey,
  boardKeys,
  fetchBoardList,
  fetchBoardTask,
  invalidateBoardStatsQueries,
} from "./queries";

/** In dev, EventSource must hit the API process directly; Vite's HTTP proxy does not keep Bun SSE subscribers alive. */
function boardEventsUrl(eventBoardId: number): string {
  const path = `/api/events?boardId=${eventBoardId}`;
  if (import.meta.env.PROD) return path;
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  const origin =
    raw && raw.length > 0 ? raw.replace(/\/$/, "") : "http://127.0.0.1:3001";
  return `${origin}${path}`;
}

/**
 * Listen for server-side board writes so CLI changes invalidate the active board
 * without waiting for focus or a manual refresh.
 */
export function useBoardChangeStream(
  routeBoardId: string | number | null,
  resolvedBoardId: number | null,
): void {
  const qc = useQueryClient();
  const routeKey = boardDetailQueryKey(routeBoardId);
  const eventBoardId =
    typeof routeKey === "number" ? routeKey : resolvedBoardId;

  useEffect(() => {
    if (eventBoardId == null) return;

    const sseUrl = boardEventsUrl(eventBoardId);
    const es = new EventSource(sseUrl);

    const boardCacheKeys: ReadonlyArray<readonly unknown[]> = [
      ...(routeKey != null ? [[...boardKeys.all, routeKey] as const] : []),
      ...(routeKey !== eventBoardId ? [boardKeys.detail(eventBoardId)] : []),
    ];

    const getCurrentBoard = (): Board | undefined => {
      for (const key of boardCacheKeys) {
        const current = qc.getQueryData<Board>(key);
        if (current) return current;
      }
      return undefined;
    };

    const setBoardCaches = (updater: (current: Board) => Board) => {
      for (const key of boardCacheKeys) {
        qc.setQueryData<Board>(key, (current) => (current ? updater(current) : current));
      }
    };

    const invalidateBoard = () => {
      // Fall back to the canonical full-board read model when the event is structural
      // or when a targeted patch cannot be trusted.
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
    };

    /** Only skip when cache is strictly newer than the event. Using `>=` would drop updates
     *  when another writer's change shares the same board `updatedAt` ms as a prior bump
     *  (multi-writer race); granular handlers still need to merge that row. */
    const isAlreadyApplied = (event: BoardEvent): boolean => {
      const current = getCurrentBoard();
      if (!current) return false;
      return current.updatedAt > event.boardUpdatedAt;
    };

    const onBoardChanged = (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (isAlreadyApplied(event)) return;
      invalidateBoard();
    };

    const onTaskCreatedOrUpdated = async (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (
        (event.kind !== "task-created" && event.kind !== "task-updated") ||
        isAlreadyApplied(event)
      ) {
        return;
      }
      try {
        const task = await fetchBoardTask(event.boardId, event.taskId);
        setBoardCaches((current) => {
          const exists = current.tasks.some((item) => item.id === task.id);
          return {
            ...current,
            tasks: exists
              ? current.tasks.map((item) => (item.id === task.id ? task : item))
              : [...current.tasks, task],
            updatedAt: event.boardUpdatedAt,
          };
        });
        // Keep the partial patch for responsiveness, then refetch the active board so
        // every external task write converges even if a future patch path misses detail.
        invalidateBoard();
      } catch {
        invalidateBoard();
      }
    };

    const onTaskDeleted = (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (event.kind !== "task-deleted" || isAlreadyApplied(event)) return;
      setBoardCaches((current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== event.taskId),
        updatedAt: event.boardUpdatedAt,
      }));
      invalidateBoard();
    };

    const onListCreatedOrUpdated = async (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (
        (event.kind !== "list-created" && event.kind !== "list-updated") ||
        isAlreadyApplied(event)
      ) {
        return;
      }
      try {
        const list = await fetchBoardList(event.boardId, event.listId);
        setBoardCaches((current) => {
          const exists = current.lists.some((item) => item.id === list.id);
          return {
            ...current,
            lists: exists
              ? current.lists.map((item) => (item.id === list.id ? list : item))
              : [...current.lists, list],
            updatedAt: event.boardUpdatedAt,
          };
        });
        // Keep the partial patch for responsiveness, then refetch the active board so
        // every external list write converges even if a future patch path misses detail.
        invalidateBoard();
      } catch {
        invalidateBoard();
      }
    };

    const onListDeleted = (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (event.kind !== "list-deleted" || isAlreadyApplied(event)) return;
      setBoardCaches((current) => ({
        ...current,
        lists: current.lists.filter((list) => list.id !== event.listId),
        tasks: current.tasks.filter((task) => task.listId !== event.listId),
        updatedAt: event.boardUpdatedAt,
      }));
      invalidateBoard();
    };

    es.addEventListener("board-changed", onBoardChanged);
    es.addEventListener("task-created", onTaskCreatedOrUpdated);
    es.addEventListener("task-updated", onTaskCreatedOrUpdated);
    es.addEventListener("task-deleted", onTaskDeleted);
    es.addEventListener("list-created", onListCreatedOrUpdated);
    es.addEventListener("list-updated", onListCreatedOrUpdated);
    es.addEventListener("list-deleted", onListDeleted);
    return () => {
      es.removeEventListener("board-changed", onBoardChanged);
      es.removeEventListener("task-created", onTaskCreatedOrUpdated);
      es.removeEventListener("task-updated", onTaskCreatedOrUpdated);
      es.removeEventListener("task-deleted", onTaskDeleted);
      es.removeEventListener("list-created", onListCreatedOrUpdated);
      es.removeEventListener("list-updated", onListCreatedOrUpdated);
      es.removeEventListener("list-deleted", onListDeleted);
      es.close();
    };
  }, [eventBoardId, qc, routeKey]);
}
