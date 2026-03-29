import { useQuery } from "@tanstack/react-query";
import type { Board, BoardIndexEntry } from "../../shared/models";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchBoard(id: string): Promise<Board> {
  return fetchJson<Board>(`/api/boards/${id}`);
}

export function useBoards() {
  return useQuery({
    queryKey: ["boards"],
    queryFn: () => fetchJson<BoardIndexEntry[]>("/api/boards"),
  });
}

export function useBoard(id: string | null) {
  return useQuery({
    queryKey: ["boards", id],
    queryFn: () => fetchBoard(id!),
    enabled: Boolean(id),
  });
}
