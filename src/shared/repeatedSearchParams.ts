/**
 * Collect repeated query keys and comma-separated fragments (same semantics as
 * `GET /api/boards/:id/tasks` for `priorityId` / `status` / `groupId`).
 */
export function repeatedSearchParamValues(
  searchParams: URLSearchParams,
  key: string,
): string[] {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
