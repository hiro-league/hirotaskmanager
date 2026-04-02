import { cn } from "@/lib/utils";

/** Labels above filter button rows — foreground-tinted for readable contrast on header surfaces in light and dark themes. */
export const BOARD_HEADER_FILTER_SECTION_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wide text-foreground/90";

const BOARD_HEADER_TEXT_BUTTON_BASE_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors";

// Keep header text buttons on a single shared visual system so filters and
// board actions stay consistent as more controls are added to the strip.
export function boardHeaderToggleButtonClass(active: boolean) {
  return cn(
    BOARD_HEADER_TEXT_BUTTON_BASE_CLASS,
    active
      // Use the app surface token instead of brand color so active buttons stay neutral across board themes.
      ? "border-border/80 bg-background/75 text-foreground shadow-sm backdrop-blur-sm"
      : "border-border bg-muted/40 text-foreground/60 hover:bg-muted hover:text-foreground",
  );
}

export function boardHeaderActionButtonClass() {
  return cn(
    BOARD_HEADER_TEXT_BUTTON_BASE_CLASS,
    "border-border bg-muted/40 text-foreground hover:bg-muted",
  );
}
