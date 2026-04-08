import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { withBrowserClientHeaders } from "./clientHeaders";
import {
  boardStatsFilterSignature,
  buildBoardStatsSearchParams,
  type BoardStatsFilter,
  type BoardStatsResponse,
} from "../../shared/boardStats";
import {
  DEFAULT_STATUS_IDS,
  statusIdsInWorkflowOrder,
  type Board,
  type BoardIndexEntry,
  type List,
  type Status,
  type Task,
} from "../../shared/models";
import type {
  TrashedBoardItem,
  TrashedListItem,
  TrashedTaskItem,
} from "../../shared/trashApi";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    // Send stable browser client metadata on every request so notifications can
    // identify this session without special-casing each call site.
    headers: withBrowserClientHeaders(init?.headers),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchBoard(id: string | number): Promise<Board> {
  // `slim=1` truncates each task body in SQLite (see board perf plan Phase 2 #7).
  return fetchJson<Board>(`/api/boards/${id}?slim=1`);
}

export async function fetchBoardTask(
  boardId: number,
  taskId: number,
): Promise<Task> {
  return fetchJson<Task>(`/api/boards/${boardId}/tasks/${taskId}`);
}

export async function fetchBoardList(
  boardId: number,
  listId: number,
): Promise<List> {
  return fetchJson<List>(`/api/boards/${boardId}/lists/${listId}`);
}

/**
 * Stable TanStack Query keys for the board index and board detail (numeric id).
 * Use for mutations, `getQueryData` / `setQueryData`, and list queries (`[...boardKeys.all, key]`).
 */
export const boardKeys = {
  all: ["boards"] as const,
  detail: (id: number) => ["boards", id] as const,
};

/** React Query key for `GET /api/boards/:boardId/tasks/:taskId` (full task, used by TaskEditor). */
export function boardTaskDetailKey(boardId: number, taskId: number) {
  return [...boardKeys.all, boardId, "task", taskId] as const;
}

/** TanStack Query keys for Trash tab fetches (`GET /api/trash/...`). */
export const trashKeys = {
  all: ["trash"] as const,
  boards: () => [...trashKeys.all, "boards"] as const,
  lists: () => [...trashKeys.all, "lists"] as const,
  tasks: () => [...trashKeys.all, "tasks"] as const,
};

export async function fetchTrashedBoards(): Promise<TrashedBoardItem[]> {
  return fetchJson<TrashedBoardItem[]>("/api/trash/boards");
}

export async function fetchTrashedLists(): Promise<TrashedListItem[]> {
  return fetchJson<TrashedListItem[]>("/api/trash/lists");
}

export async function fetchTrashedTasks(): Promise<TrashedTaskItem[]> {
  return fetchJson<TrashedTaskItem[]>("/api/trash/tasks");
}

export function useTrashedBoards() {
  return useQuery({
    queryKey: trashKeys.boards(),
    queryFn: fetchTrashedBoards,
  });
}

export function useTrashedLists() {
  return useQuery({
    queryKey: trashKeys.lists(),
    queryFn: fetchTrashedLists,
  });
}

export function useTrashedTasks() {
  return useQuery({
    queryKey: trashKeys.tasks(),
    queryFn: fetchTrashedTasks,
  });
}

/**
 * React Query detail key must match board mutation cache writes (`board.id` is always a number).
 * URL params from `useParams` are numeric strings, which would otherwise key as `["boards","1"]`
 * while mutations use `["boards",1]` — updates never hit the subscribed query.
 */
export function boardDetailQueryKey(
  id: string | number | null | undefined,
): string | number | null {
  if (id == null || id === "") return null;
  if (typeof id === "number") return id;
  if (/^\d+$/.test(id)) return Number(id);
  return id;
}

export async function fetchStatuses(): Promise<Status[]> {
  return fetchJson<Status[]>("/api/statuses");
}

export function useBoards() {
  return useQuery({
    queryKey: boardKeys.all,
    queryFn: () => fetchJson<BoardIndexEntry[]>("/api/boards"),
  });
}

export function useBoard(id: string | number | null) {
  const key = boardDetailQueryKey(id);
  return useQuery({
    queryKey: [...boardKeys.all, key],
    queryFn: () => fetchBoard(id!),
    enabled: key != null,
  });
}

/** Workflow status definitions from SQLite (`status` table). */
export function useStatuses() {
  return useQuery({
    queryKey: ["statuses"],
    queryFn: fetchStatuses,
    staleTime: 1000 * 60 * 60,
  });
}

/** Ordered status ids for band layout and sorting (fallback before fetch completes). */
export function useStatusWorkflowOrder(): readonly string[] {
  const { data: statuses } = useStatuses();
  return useMemo(
    () =>
      statuses?.length
        ? statusIdsInWorkflowOrder(statuses)
        : [...DEFAULT_STATUS_IDS],
    [statuses],
  );
}

export async function fetchBoardStats(
  boardId: number,
  filter: BoardStatsFilter,
): Promise<BoardStatsResponse> {
  const q = buildBoardStatsSearchParams(filter).toString();
  return fetchJson<BoardStatsResponse>(
    `/api/boards/${boardId}/stats${q ? `?${q}` : ""}`,
  );
}

/** Invalidate every stats query for a board (any filter); call after task/list/board mutations. */
export function invalidateBoardStatsQueries(
  qc: QueryClient,
  boardId: number,
): void {
  void qc.invalidateQueries({
    queryKey: [...boardKeys.all, boardId, "stats"],
  });
}

/**
 * Canonical server stats for the board page; key is board id + filter signature (not `updatedAt`,
 * so optimistic board cache bumps do not churn this query — mutations invalidate stats instead).
 * Uses previous data while filters change so chips stay stable with a subtle in-chip loading state.
 */
export function useBoardStats(
  boardId: number | null,
  filter: BoardStatsFilter | null,
  opts: { enabled: boolean },
) {
  const filterSig = filter ? boardStatsFilterSignature(filter) : "";

  return useQuery({
    queryKey: [...boardKeys.all, boardId, "stats", filterSig],
    queryFn: () => {
      if (boardId == null || filter == null) {
        throw new Error("useBoardStats: missing board id or filter");
      }
      return fetchBoardStats(boardId, filter);
    },
    enabled: boardId != null && filter != null && opts.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export type { BoardStatsFilter, BoardStatsResponse };
