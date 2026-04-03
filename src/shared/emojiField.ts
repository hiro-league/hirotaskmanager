/** Max grapheme clusters allowed in optional emoji metadata (boards/lists/groups/tasks). */
export const MAX_EMOJI_GRAPHEMES = 10;

function countGraphemes(s: string): number {
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
      let n = 0;
      for (const _ of seg.segment(s)) n++;
      return n;
    }
  } catch {
    // Fall back below.
  }
  return [...s].length;
}

export type ParseEmojiFieldResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Normalize and validate emoji metadata for storage.
 * Blank or whitespace-only input clears (`null`).
 */
export function parseEmojiField(raw: string): ParseEmojiFieldResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  const n = countGraphemes(trimmed);
  if (n > MAX_EMOJI_GRAPHEMES) {
    return {
      ok: false,
      error: `Emoji must be at most ${MAX_EMOJI_GRAPHEMES} graphemes`,
    };
  }
  return { ok: true, value: trimmed };
}
