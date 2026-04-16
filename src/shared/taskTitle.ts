/**
 * Task title limits use Unicode grapheme clusters (user-perceived characters),
 * not JavaScript string length / UTF-16 code units — so CJK, Arabic, and
 * multi-scalar emoji count as one “letter” each when applicable.
 */

import { countGraphemes, truncateToMaxGraphemes } from "./grapheme";

/** Max task title length in user-perceived characters (grapheme clusters). */
export const TASK_TITLE_MAX_GRAPHEMES = 80;
export { countGraphemes, truncateToMaxGraphemes } from "./grapheme";

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
