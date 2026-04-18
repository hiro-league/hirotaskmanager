import { useMemo } from "react";
import {
  useQuery,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { withBrowserClientHeaders } from "./clientHeaders";
import { LONG_STALE_TIME_MS } from "./queryDefaults";
import {
  boardStatsFilterSignature,
  buildBoardStatsSearchParams,
  type BoardStatsFilter,
  type BoardStatsResponse,
} from "../../shared/boardStats";
import type { PaginatedListBody } from "../../shared/pagination";
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

/** Thrown by {@link fetchJson} on non-OK responses so callers can skip TanStack Query retries for 4xx. */
export type HttpError = Error & { status: number };

function isClientHttpError(error: unknown): error is HttpError {
  if (!(error instanceof Error)) return false;
  const status = (error as HttpError).status;
  return typeof status === "number" && status >= 400 && status < 500;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    // Send stable browser client metadata on every request so notifications can
    // identify this session without special-casing each call site.
    headers: withBrowserClientHeaders(init?.headers),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText) as HttpError;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function fetchBoard(id: string | number): Promise<Board> {
  // `slim=1` truncates each task body in SQLite (see board perf plan Phase 2 #7).
  return fetchJson<Board>(`/api/boards/${id}?slim=1`);
}

/** Full task row by global id (`GET /api/tasks/:taskId`). */
export async function fetchTaskById(taskId: number): Promise<Task> {
  return fetchJson<Task>(`/api/tasks/${taskId}`);
}

/** List row by global id (`GET /api/lists/:listId`). */
export async function fetchListById(listId: number): Promise<List> {
  return fetchJson<List>(`/api/lists/${listId}`);
}

/**
 * Stable TanStack Query keys for the board index and board detail (numeric id).
 * Use for mutations, `getQueryData` / `setQueryData`, and list queries (`[...boardKeys.all, key]`).
 */
export const boardKeys = {
  all: ["boards"] as const,
  detail: (id: number) => ["boards", id] as const,
};

/** React Query key for `GET /api/tasks/:taskId` (full task, used by TaskEditor). */
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

const API_PAGE_SIZE = 500;

async function fetchAllPaginated<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const p = new URLSearchParams();
    p.set("limit", String(API_PAGE_SIZE));
    if (offset > 0) {
      p.set("offset", String(offset));
    }
    const body = await fetchJson<PaginatedListBody<T>>(
      `${path}?${p.toString()}`,
    );
    out.push(...body.items);
    if (body.items.length === 0 || out.length >= body.total) {
      break;
    }
    offset += API_PAGE_SIZE;
  }
  return out;
}

export async function fetchTrashedBoards(): Promise<TrashedBoardItem[]> {
  return fetchAllPaginated<TrashedBoardItem>("/api/trash/boards");
}

export async function fetchTrashedLists(): Promise<TrashedListItem[]> {
  return fetchAllPaginated<TrashedListItem>("/api/trash/lists");
}

export async function fetchTrashedTasks(): Promise<TrashedTaskItem[]> {
  return fetchAllPaginated<TrashedTaskItem>("/api/trash/tasks");
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
 * React Query detail key must match board mutation cache writes (`board.boardId` is always a number).
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
    queryFn: () => fetchAllPaginated<BoardIndexEntry>("/api/boards"),
  });
}

/** Don’t retry 4xx (e.g. missing board) — default Query retries would delay the not-found UI by seconds. */
function boardDetailRetry(failureCount: number, error: unknown): boolean {
  if (isClientHttpError(error)) return false;
  return failureCount < 3;
}

export function useBoard(id: string | number | null) {
  const key = boardDetailQueryKey(id);
  return useQuery({
    queryKey: [...boardKeys.all, key],
    queryFn: () => fetchBoard(id!),
    enabled: key != null,
    retry: boardDetailRetry,
  });
}

/**
 * Suspense variant for the board route: `data` is defined after the query resolves.
 * Use only under `<Suspense>` + an error boundary (see `BoardQueryErrorBoundary`).
 */
export function useSuspenseBoard(boardId: string | number) {
  const key = boardDetailQueryKey(boardId);
  return useSuspenseQuery({
    queryKey: [...boardKeys.all, key],
    queryFn: () => fetchBoard(boardId),
    retry: boardDetailRetry,
  });
}

/** Workflow status definitions from SQLite (`status` table). */
export function useStatuses() {
  return useQuery({
    queryKey: ["statuses"],
    queryFn: fetchStatuses,
    staleTime: LONG_STALE_TIME_MS,
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
