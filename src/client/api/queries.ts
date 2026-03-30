import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_STATUS_IDS,
  statusIdsInWorkflowOrder,
  type Board,
  type BoardIndexEntry,
  type Status,
} from "../../shared/models";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchBoard(id: string | number): Promise<Board> {
  return fetchJson<Board>(`/api/boards/${id}`);
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
    queryKey: ["boards"],
    queryFn: () => fetchJson<BoardIndexEntry[]>("/api/boards"),
  });
}

export function useBoard(id: string | number | null) {
  const key = boardDetailQueryKey(id);
  return useQuery({
    queryKey: ["boards", key],
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
