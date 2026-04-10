import type { PaginatedListBody } from "../../shared/pagination";

/** Build `limit` / `offset` query string; omit `limit` when null (server returns full remainder). */
export function paginationQuery(
  offset: number,
  limit: number | null,
): string {
  const p = new URLSearchParams();
  if (limit != null) {
    p.set("limit", String(limit));
  }
  if (offset > 0) {
    p.set("offset", String(offset));
  }
  const qs = p.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

/**
 * Follow pages until all items are loaded (uses `items.length` to advance offset).
 * Response uses `offset: 0` and `limit: items.length` for a merged envelope.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number) => Promise<PaginatedListBody<T>>,
  pageSize: number,
): Promise<PaginatedListBody<T>> {
  const all: T[] = [];
  let offset = 0;
  let total = 0;
  for (;;) {
    const body = await fetchPage(offset);
    total = body.total;
    all.push(...body.items);
    if (body.items.length === 0 || all.length >= total) {
      return { items: all, total, limit: all.length, offset: 0 };
    }
    offset += pageSize;
  }
}
