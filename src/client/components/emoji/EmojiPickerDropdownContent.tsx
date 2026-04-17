import EmojiPicker, { Theme } from "emoji-picker-react";
import { parseEmojiField } from "../../../shared/emojiField";

export interface EmojiPickerDropdownContentProps {
  open: boolean;
  dark: boolean;
  emoji: string | null | undefined;
  onPick: (emoji: string | null) => void;
  onValidationError: (message: string) => void;
  /** Close the dropdown after a selection or clear (Radix menu state lives in the parent). */
  onRequestClose: () => void;
}

/**
 * Emoji picker surface only — split from `EmojiPickerMenuButton` so `emoji-picker-react`
 * loads on first dropdown open (bundle-conditional).
 */
export default function EmojiPickerDropdownContent({
  open,
  dark,
  emoji,
  onPick,
  onValidationError,
  onRequestClose,
}: EmojiPickerDropdownContentProps) {
  return (
    <>
      <EmojiPicker
        open={open}
        theme={dark ? Theme.DARK : Theme.LIGHT}
        width={320}
        height={400}
        lazyLoadEmojis
        searchPlaceholder="Search emoji"
        searchClearButtonLabel="Clear search"
        previewConfig={{ showPreview: false }}
        onEmojiClick={(data) => {
          const parsed = parseEmojiField(data.emoji);
          if (!parsed.ok) {
            onValidationError(parsed.error);
            return;
          }
          onPick(parsed.value);
          onRequestClose();
        }}
      />
      {emoji ? (
        <div className="border-t border-border px-2 py-2">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => {
              onPick(null);
              onRequestClose();
            }}
          >
            Clear emoji
          </button>
        </div>
      ) : null}
    </>
  );
}
