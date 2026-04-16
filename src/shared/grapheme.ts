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
export function countGraphemes(value: string): number {
  const activeSegmenter = getGraphemeSegmenter();
  if (activeSegmenter) {
    let count = 0;
    for (const _segment of activeSegmenter.segment(value)) count++;
    return count;
  }

  // Fallback: extended grapheme clusters unavailable — approximate via code points.
  let count = 0;
  for (const _char of value) count++;
  return count;
}

/** Truncate to at most `max` grapheme clusters (suffix removed, no ellipsis). */
export function truncateToMaxGraphemes(value: string, max: number): string {
  if (max <= 0) return "";

  const activeSegmenter = getGraphemeSegmenter();
  if (activeSegmenter) {
    const parts: string[] = [];
    let count = 0;
    for (const { segment } of activeSegmenter.segment(value)) {
      if (count >= max) break;
      parts.push(segment);
      count++;
    }
    return parts.join("");
  }

  let output = "";
  let count = 0;
  for (const char of value) {
    if (count >= max) break;
    output += char;
    count++;
  }
  return output;
}

/** First user-perceived character (grapheme cluster), or empty string if `value` is empty. */
export function firstGrapheme(value: string): string {
  return truncateToMaxGraphemes(value, 1);
}
