import { fetchJson } from "./queries";
import type { SearchHit } from "../../shared/models";

export async function fetchBoardSearchHits(
  q: string,
  boardId: string | number,
  options: { limit?: number } = {},
): Promise<SearchHit[]> {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("board", String(boardId));
  if (options.limit != null) {
    params.set("limit", String(options.limit));
  }
  return fetchJson<SearchHit[]>(`/api/search?${params.toString()}`);
}
