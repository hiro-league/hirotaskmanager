/**
 * Task title limits use Unicode grapheme clusters (user-perceived characters),
 * not JavaScript string length / UTF-16 code units — so CJK, Arabic, and
 * multi-scalar emoji count as one “letter” each when applicable.
 */

/** Max task title length in user-perceived characters (grapheme clusters). */
export const TASK_TITLE_MAX_GRAPHEMES = 80;

let segmenter: Intl.Segmenter | null | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    try {
      segmenter =
        typeof Intl.Segmenter === "function"
          ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
          : null;
    } catch {
      segmenter = null;
    }
  }
  return segmenter;
}

/** Count Unicode grapheme clusters (not UTF-16 code units). */
export function countGraphemes(s: string): number {
  const seg = getGraphemeSegmenter();
  if (seg) {
    let n = 0;
    for (const _ of seg.segment(s)) n++;
    return n;
  }
  // Fallback: extended grapheme clusters unavailable — approximate via code points.
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Truncate to at most `max` grapheme clusters (suffix removed, no ellipsis). */
export function truncateToMaxGraphemes(s: string, max: number): string {
  if (max <= 0) return "";
  const seg = getGraphemeSegmenter();
  if (seg) {
    const parts: string[] = [];
    let n = 0;
    for (const { segment } of seg.segment(s)) {
      if (n >= max) break;
      parts.push(segment);
      n++;
    }
    return parts.join("");
  }
  let out = "";
  let n = 0;
  for (const ch of s) {
    if (n >= max) break;
    out += ch;
    n++;
  }
  return out;
}

/** Trim and enforce max length for persisted `task.title` values. */
export function normalizeStoredTaskTitle(raw: string): string {
  return truncateToMaxGraphemes(raw.trim(), TASK_TITLE_MAX_GRAPHEMES);
}

/** Clamp live title input (typing / paste) to the same limit. */
export function clampTaskTitleInput(value: string): string {
  return truncateToMaxGraphemes(value, TASK_TITLE_MAX_GRAPHEMES);
}

/** Remaining grapheme budget for the title field (0 … {@link TASK_TITLE_MAX_GRAPHEMES}). */
export function taskTitleGraphemesRemaining(current: string): number {
  return Math.max(0, TASK_TITLE_MAX_GRAPHEMES - countGraphemes(current));
}
