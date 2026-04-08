import type { ReleaseDefinition } from "./models";

/**
 * Merge a created/updated release into the board's list with the same ordering as
 * `listReleasesForBoard` (createdAt ASC, id ASC) so SSE patches match server reads.
 */
export function mergeReleaseUpsertIntoList(
  releases: readonly ReleaseDefinition[],
  next: ReleaseDefinition,
): ReleaseDefinition[] {
  const without = releases.filter((r) => r.id !== next.id);
  const merged = [...without, next];
  merged.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
  );
  return merged;
}
