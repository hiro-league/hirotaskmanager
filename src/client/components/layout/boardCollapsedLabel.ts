import { firstGrapheme } from "../../../shared/grapheme";

/** Collapsed rail: one grapheme when board emoji is set, else initials from the name. */
export function boardCollapsedLabel(name: string, emoji?: string | null): string {
  const e = emoji?.trim();
  if (e) {
    const first = firstGrapheme(e);
    if (first) return first;
    return [...e][0] ?? "?";
  }
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const a = words[0][0] ?? "";
  const b = words[1][0] ?? "";
  return (a + b).toUpperCase() || "?";
}
