import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Smile } from "lucide-react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { parseEmojiField } from "../../../shared/emojiField";
import { cn } from "@/lib/utils";

function subscribeDarkMode(callback: () => void): () => void {
  const el = document.documentElement;
  const obs = new MutationObserver(callback);
  obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function getDarkSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function useDocumentDark(): boolean {
  return useSyncExternalStore(subscribeDarkMode, getDarkSnapshot, () => false);
}

export interface EmojiPickerMenuButtonProps {
  emoji: string | null | undefined;
  disabled: boolean;
  onPick: (emoji: string | null) => void;
  onValidationError: (message: string) => void;
  /** `aria-label` when no emoji is selected. */
  chooseAriaLabel?: string;
  /** `aria-label` when an emoji is shown (e.g. screen reader context). */
  selectedAriaLabel?: (emoji: string) => string;
  /**
   * When true, the trigger always shows the placeholder icon even if `emoji` is set
   * (use when the chosen emoji is rendered elsewhere, e.g. list title).
   */
  alwaysShowPlaceholder?: boolean;
  /** Replaces the default smile icon when the trigger shows the placeholder. */
  placeholderIcon?: ReactNode;
  /** Smaller control with lighter chrome (e.g. list headers). */
  compact?: boolean;
  /** Extra classes for the trigger button. */
  triggerClassName?: string;
}

export function EmojiPickerMenuButton({
  emoji,
  disabled,
  onPick,
  onValidationError,
  chooseAriaLabel = "Choose emoji",
  selectedAriaLabel = (e) => `Emoji ${e}`,
  alwaysShowPlaceholder = false,
  placeholderIcon,
  compact = false,
  triggerClassName,
}: EmojiPickerMenuButtonProps) {
  const dark = useDocumentDark();
  const [open, setOpen] = useState(false);

  // Close menu when disabled (e.g. task group marked for delete) so picker cannot stay open.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const ariaLabel = emoji
    ? selectedAriaLabel(emoji)
    : chooseAriaLabel;

  const showEmojiInTrigger = Boolean(emoji) && !alwaysShowPlaceholder;
  const defaultPlaceholder = (
    <Smile
      className={cn("text-muted-foreground", compact ? "size-3.5" : "size-4")}
      aria-hidden
    />
  );

  return (
    <DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border border-input bg-background text-lg leading-none text-foreground hover:bg-muted disabled:opacity-50",
            compact
              ? "size-6 border-transparent bg-transparent text-muted-foreground hover:bg-muted/70"
              : "size-9",
            triggerClassName,
          )}
          aria-label={ariaLabel}
        >
          {showEmojiInTrigger ? (
            <span aria-hidden>{emoji}</span>
          ) : (
            (placeholderIcon ?? defaultPlaceholder)
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[60] max-h-[min(480px,70vh)] overflow-auto rounded-md border border-border bg-popover p-0 text-popover-foreground shadow-md"
          sideOffset={6}
          align="start"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
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
              setOpen(false);
            }}
          />
          {emoji ? (
            <div className="border-t border-border px-2 py-2">
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  onPick(null);
                  setOpen(false);
                }}
              >
                Clear emoji
              </button>
            </div>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
