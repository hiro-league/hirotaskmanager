/**
 * Derive a filesystem-safe slug from a board name.
 * - lowercased, trimmed, non-alphanumeric runs replaced with a single hyphen
 * - leading/trailing hyphens stripped
 * - falls back to "board" if the result is empty
 */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "board";
}

/**
 * Given a desired slug and a set of already-taken slugs, return a unique
 * variant by appending `-2`, `-3`, etc. when needed.
 */
export function uniqueSlug(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) return desired;
  let n = 2;
  while (taken.has(`${desired}-${n}`)) n++;
  return `${desired}-${n}`;
}
