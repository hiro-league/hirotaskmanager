import { useQuery } from "@tanstack/react-query";
import {
  normalizeBoardFromJson,
  type Board,
  type BoardIndexEntry,
} from "../../shared/models";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchBoard(id: string): Promise<Board> {
  const raw = await fetchJson<Record<string, unknown>>(`/api/boards/${id}`);
  return normalizeBoardFromJson(raw);
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
