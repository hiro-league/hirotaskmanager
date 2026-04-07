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

/** Reserves space for the section edit icon so filter labels and buttons do not shift on header hover. */
export const BOARD_HEADER_SECTION_EDIT_ICON_SLOT_CLASS =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center";

export function boardHeaderSectionEditIconButtonClass(headerHovered: boolean) {
  return cn(
    "inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity duration-150 hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]",
    headerHovered ? "opacity-100" : "opacity-0 pointer-events-none",
  );
}
