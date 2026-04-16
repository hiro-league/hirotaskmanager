import type { PaginatedListBody } from "../../shared/pagination";
import type { SearchHit } from "../../shared/models";
import { fetchJson } from "./queries";

/** React Query key for {@link fetchBoardSearchHits}. */
export function boardSearchQueryKey(
  boardId: string | number,
  q: string,
  limit: number,
): readonly [string, string | number, string, number] {
  return ["board-search", boardId, q, limit] as const;
}

export async function fetchBoardSearchHits(
  q: string,
  boardId: string | number,
  options: { limit?: number } = {},
): Promise<SearchHit[]> {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("board", String(boardId));
  params.set("limit", String(options.limit ?? 20));
  const body = await fetchJson<PaginatedListBody<SearchHit>>(
    `/api/search?${params.toString()}`,
  );
  return body.items;
}
