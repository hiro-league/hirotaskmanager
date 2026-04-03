import { parseEmojiField } from "../../shared/emojiField";
import { CliError } from "./output";

/** Optional `--emoji` flag: omit key when undefined, send null when cleared. */
export function parseOptionalEmojiFlag(raw: string | undefined): {
  omit: true;
} | { omit: false; value: string | null } {
  if (raw === undefined) return { omit: true };
  const parsed = parseEmojiField(raw);
  if (!parsed.ok) {
    throw new CliError(parsed.error, 2);
  }
  return { omit: false, value: parsed.value };
}
