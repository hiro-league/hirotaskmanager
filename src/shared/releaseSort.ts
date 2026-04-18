import type { ReleaseDefinition } from "./models";

/**
 * Single ordering for release pickers, CLI describe, and the releases editor:
 * `releaseDate` descending (latest first), missing/empty dates last; among undated
 * rows, alphabetical by name (then `releaseId` for stability). When two rows share
 * the same date, tie-break by `createdAt` descending then `releaseId` descending.
 */
export function sortReleasesForDisplay(
  releases: readonly ReleaseDefinition[],
): ReleaseDefinition[] {
  return [...releases].sort((a, b) => {
    const ad =
      a.releaseDate != null && String(a.releaseDate).trim() !== ""
        ? String(a.releaseDate).trim()
        : null;
    const bd =
      b.releaseDate != null && String(b.releaseDate).trim() !== ""
        ? String(b.releaseDate).trim()
        : null;
    if (ad !== null && bd !== null) {
      const c = bd.localeCompare(ad);
      if (c !== 0) return c;
      const tc = b.createdAt.localeCompare(a.createdAt);
      if (tc !== 0) return tc;
      return b.releaseId - a.releaseId;
    }
    if (ad !== null && bd === null) {
      return -1;
    }
    if (ad === null && bd !== null) {
      return 1;
    }
    const nameCmp = a.name
      .trim()
      .localeCompare(b.name.trim(), undefined, { sensitivity: "base" });
    if (nameCmp !== 0) return nameCmp;
    return a.releaseId - b.releaseId;
  });
}
