import { Eraser } from "lucide-react";
import type { ReleaseDefinition } from "../../../../shared/models";
import { isValidHexColor } from "../../../../shared/hexColor";
import { cn } from "@/lib/utils";

/** Native color input needs a valid hex when the stored value is empty or invalid. */
export const DEFAULT_PICKER_HEX = "#3b82f6";

/** ~Half the prior flex-1 / min-w-[10rem] name column; fixed so color/date columns stay aligned. */
export const releaseNameLabelClass = "w-20 shrink-0 text-xs sm:w-24";

/** Native date picker glyph can blend into `bg-background` in dark mode; invert for contrast. */
export const releaseDateInputClass =
  "mt-1 block h-9 min-w-[11rem] rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground " +
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 " +
  "dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-90";

/** Icon-only clear for color fields; keeps release rows on one line. */
export function ClearColorIconButton(props: {
  disabled: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      title="Clear color"
      aria-label={props.label ?? "Clear color"}
      disabled={props.disabled}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      onClick={props.onClick}
    >
      <Eraser className="size-4" aria-hidden />
    </button>
  );
}

export function colorPickerDisplayValue(hex: string): string {
  const t = hex.trim();
  return isValidHexColor(t) ? t : DEFAULT_PICKER_HEX;
}

/**
 * Native `<input type="color">` must use a valid hex `value`, so we keep the fallback internally
 * but hide the swatch when the release has no saved color — show dashed “empty” chrome instead.
 */
export function ReleaseColorSwatchInput(props: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (hex: string) => void;
}) {
  const trimmed = props.value.trim();
  const hasColor = isValidHexColor(trimmed);
  return (
    <div
      className={cn(
        "relative h-9 w-10 shrink-0 overflow-hidden rounded-md border bg-background",
        hasColor ? "border-input" : "border-dashed border-muted-foreground/45 bg-muted/35",
      )}
    >
      {hasColor ? (
        <span
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: trimmed }}
          aria-hidden
        />
      ) : (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-medium text-muted-foreground/60"
          aria-hidden
        >
          —
        </span>
      )}
      <input
        type="color"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        value={colorPickerDisplayValue(props.value)}
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

export function releaseRowDirty(
  r: ReleaseDefinition,
  row: { name: string; color: string; releaseDate: string },
): boolean {
  const origColor = r.color?.trim() ?? "";
  const origDate = r.releaseDate?.trim() ?? "";
  return (
    row.name.trim() !== r.name ||
    row.color.trim() !== origColor ||
    row.releaseDate.trim() !== origDate
  );
}

export function rowCanSave(
  r: ReleaseDefinition,
  row: { name: string; color: string; releaseDate: string },
): boolean {
  if (!row.name.trim()) return false;
  const c = row.color.trim();
  if (c && !isValidHexColor(c)) return false;
  return releaseRowDirty(r, row);
}
