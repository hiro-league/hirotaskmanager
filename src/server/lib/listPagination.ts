import { MAX_PAGE_LIMIT } from "../../shared/pagination";

export type ParsedListPagination =
  | { ok: true; offset: number; limit: number | null }
  | { ok: false; error: string };

/**
 * Parse `offset` and `limit` query params for list endpoints.
 * When `limit` is omitted, `defaultLimit` is used (null = no cap; caller returns full slice from offset).
 */
export function parseListPagination(
  searchParams: URLSearchParams,
  options: { defaultLimit: number | null },
): ParsedListPagination {
  const offsetRaw = searchParams.get("offset");
  let offset = 0;
  if (offsetRaw !== null && offsetRaw !== "") {
    const n = Number(offsetRaw);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: "Invalid offset" };
    }
    offset = n;
  }

  const limitRaw = searchParams.get("limit");
  if (limitRaw === null || limitRaw === "") {
    return { ok: true, offset, limit: options.defaultLimit };
  }
  const lim = Number(limitRaw);
  // Allow limit=0 for "count only" responses (empty items, total preserved).
  if (!Number.isInteger(lim) || lim < 0) {
    return { ok: false, error: "Invalid limit" };
  }
  if (lim > MAX_PAGE_LIMIT) {
    return { ok: false, error: `limit exceeds ${MAX_PAGE_LIMIT}` };
  }
  return { ok: true, offset, limit: lim };
}
