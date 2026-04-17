/**
 * Shared shape for paginated list responses (`GET` list endpoints).
 * Consumers use `items`; `total` is the full result set before paging.
 */

export interface PaginatedListBody<T> {
  items: T[];
  total: number;
  /** Requested page size (may be larger than `items.length` on last page). */
  limit: number;
  /** Start index into the full ordered result set. */
  offset: number;
}

/** Hard cap per request to limit work per HTTP round-trip. */
export const MAX_PAGE_LIMIT = 500;

export function paginateInMemory<T>(
  rows: readonly T[],
  offset: number,
  limit: number | null,
): PaginatedListBody<T> {
  const total = rows.length;
  const off = Math.min(Math.max(0, offset), total);
  if (limit == null) {
    const slice = rows.slice(off);
    return {
      items: [...slice],
      total,
      limit: slice.length,
      offset: off,
    };
  }
  if (limit === 0) {
    return { items: [], total, limit: 0, offset: off };
  }
  const lim = Math.min(Math.max(1, limit), MAX_PAGE_LIMIT);
  const items = rows.slice(off, off + lim);
  return { items: [...items], total, limit: lim, offset: off };
}
