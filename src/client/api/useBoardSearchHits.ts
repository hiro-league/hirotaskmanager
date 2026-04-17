import { useQuery } from "@tanstack/react-query";
import { boardSearchQueryKey, fetchBoardSearchHits } from "./search";

/**
 * Board-scoped FTS search for the header modal; lives in a separate module from
 * {@link fetchBoardSearchHits} so tests can `vi.spyOn` the fetch without same-file
 * call semantics bypassing the mock.
 */
export function useBoardSearchHits(options: {
  boardId: number;
  q: string;
  limit: number;
  /** When false, the query does not run (e.g. dialog closed). */
  enabled: boolean;
}) {
  const { boardId, q, limit, enabled } = options;
  return useQuery({
    queryKey: boardSearchQueryKey(boardId, q, limit),
    queryFn: () => fetchBoardSearchHits(q, boardId, { limit }),
    enabled: enabled && q.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}
