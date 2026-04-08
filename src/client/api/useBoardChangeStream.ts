import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardEvent } from "../../shared/boardEvents";
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
import { devDirectApiOrigin } from "./devDirectApiOrigin";

/** In dev, EventSource must hit the API process directly; Vite's HTTP proxy does not keep Bun SSE subscribers alive. */
function boardEventsUrl(eventBoardId: number): string {
  const path = `/api/events?boardId=${eventBoardId}`;
  if (import.meta.env.PROD) return path;
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  const fallbackOrigin = devDirectApiOrigin();
  const origin =
    raw && raw.length > 0 ? raw.replace(/\/$/, "") : fallbackOrigin;
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
    const es = new EventSource(sseUrl, { withCredentials: true });

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

    const onReleaseUpserted = (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (event.kind !== "release-upserted" || isAlreadyApplied(event)) {
        return;
      }
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
      invalidateBoardStatsQueries(qc, event.boardId);
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
        qc.setQueryData(boardTaskDetailKey(event.boardId, event.taskId), task);
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

    const onTaskRemovedFromLiveBoard = (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (
        (event.kind !== "task-deleted" &&
          event.kind !== "task-trashed" &&
          event.kind !== "task-purged") ||
        isAlreadyApplied(event)
      ) {
        return;
      }
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

    const onListRemovedFromLiveBoard = (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (
        (event.kind !== "list-deleted" &&
          event.kind !== "list-trashed" &&
          event.kind !== "list-purged") ||
        isAlreadyApplied(event)
      ) {
        return;
      }
      setBoardCaches((current) => ({
        ...current,
        lists: current.lists.filter((list) => list.id !== event.listId),
        tasks: current.tasks.filter((task) => task.listId !== event.listId),
        updatedAt: event.boardUpdatedAt,
      }));
      invalidateBoard();
    };

    const onTaskOrListRestored = (raw: Event) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as BoardEvent;
      if (
        (event.kind !== "task-restored" && event.kind !== "list-restored") ||
        isAlreadyApplied(event)
      ) {
        return;
      }
      invalidateBoard();
    };

    es.addEventListener("board-changed", onBoardChanged);
    es.addEventListener("release-upserted", onReleaseUpserted);
    es.addEventListener("task-created", onTaskCreatedOrUpdated);
    es.addEventListener("task-updated", onTaskCreatedOrUpdated);
    es.addEventListener("task-deleted", onTaskRemovedFromLiveBoard);
    es.addEventListener("task-trashed", onTaskRemovedFromLiveBoard);
    es.addEventListener("task-purged", onTaskRemovedFromLiveBoard);
    es.addEventListener("task-restored", onTaskOrListRestored);
    es.addEventListener("list-created", onListCreatedOrUpdated);
    es.addEventListener("list-updated", onListCreatedOrUpdated);
    es.addEventListener("list-deleted", onListRemovedFromLiveBoard);
    es.addEventListener("list-trashed", onListRemovedFromLiveBoard);
    es.addEventListener("list-purged", onListRemovedFromLiveBoard);
    es.addEventListener("list-restored", onTaskOrListRestored);
    return () => {
      es.removeEventListener("board-changed", onBoardChanged);
      es.removeEventListener("release-upserted", onReleaseUpserted);
      es.removeEventListener("task-created", onTaskCreatedOrUpdated);
      es.removeEventListener("task-updated", onTaskCreatedOrUpdated);
      es.removeEventListener("task-deleted", onTaskRemovedFromLiveBoard);
      es.removeEventListener("task-trashed", onTaskRemovedFromLiveBoard);
      es.removeEventListener("task-purged", onTaskRemovedFromLiveBoard);
      es.removeEventListener("task-restored", onTaskOrListRestored);
      es.removeEventListener("list-created", onListCreatedOrUpdated);
      es.removeEventListener("list-updated", onListCreatedOrUpdated);
      es.removeEventListener("list-deleted", onListRemovedFromLiveBoard);
      es.removeEventListener("list-trashed", onListRemovedFromLiveBoard);
      es.removeEventListener("list-purged", onListRemovedFromLiveBoard);
      es.removeEventListener("list-restored", onTaskOrListRestored);
      es.close();
    };
  }, [eventBoardId, qc, routeKey]);
}
