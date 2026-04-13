import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Light swatches need a ring so the dot stays visible on light popover backgrounds. */
function isVeryLightSwatchBackground(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c === "#ffffff" || c === "#fff" || c === "white";
}

export type TaskFieldSwatchSelectOption = {
  value: string;
  label: string;
  /**
   * Secondary segment after `label`, spaced apart by gap only (e.g. release date — muted color).
   */
  dateLabel?: string;
  /** When set, renders a filled circle; otherwise a dashed “no color” placeholder (releases). */
  fillColor?: string | null;
  /** Board default release: yellow star at end of row (task editor release field). */
  boardDefault?: boolean;
};

interface TaskFieldSwatchSelectProps {
  /** For label association (accessibility). */
  labelId: string;
  value: string;
  options: TaskFieldSwatchSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  tabIndex?: number;
  /**
   * When false, no swatch column — same trigger/menu chrome as priority/release (avoids native
   * `<select>` arrow spacing). Use for task group names.
   */
  showSwatch?: boolean;
  /** When the trigger sits in a row with a sibling (e.g. default-release button), parent supplies `mt-1`. */
  omitTriggerTopMargin?: boolean;
}

function OptionPrimaryLabel({
  label,
  dateLabel,
}: {
  label: string;
  dateLabel?: string;
}) {
  const date = dateLabel?.trim();
  if (!date) {
    return <span className="min-w-0 flex-1 truncate">{label}</span>;
  }
  return (
    <span className="flex min-h-0 min-w-0 flex-1 items-baseline gap-4 overflow-hidden">
      <span className="min-w-0 shrink truncate">{label}</span>
      <span
        className={cn(
          "shrink-0 text-[13px] tabular-nums tracking-tight",
          "text-muted-foreground group-data-[highlighted]:text-accent-foreground/90",
        )}
      >
        {date}
      </span>
    </span>
  );
}

function BoardDefaultStar() {
  return (
    <span title="Board default release" aria-label="Board default release">
      <Star
        className="size-3.5 shrink-0 fill-yellow-400 text-yellow-600"
        strokeWidth={1.75}
        aria-hidden
      />
    </span>
  );
}

function Swatch({
  fillColor,
  sizeClassName = "size-3.5",
}: {
  fillColor?: string | null;
  sizeClassName?: string;
}) {
  if (fillColor != null && fillColor !== "") {
    const light = isVeryLightSwatchBackground(fillColor);
    return (
      <span
        className={cn(
          "inline-flex shrink-0 rounded-full border",
          sizeClassName,
          light ? "border-border/80" : "border-black/20",
        )}
        style={{ backgroundColor: fillColor }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border-2 border-dashed border-muted-foreground/45 bg-transparent",
        sizeClassName,
      )}
      aria-hidden
    />
  );
}

export function TaskFieldSwatchSelect({
  labelId,
  value,
  options,
  onChange,
  disabled,
  tabIndex,
  showSwatch = true,
  omitTriggerTopMargin = false,
}: TaskFieldSwatchSelectProps) {
  const selected = options.find((o) => o.value === value);
  const display =
    selected ??
    options[0] ?? {
      value: "",
      label: "",
      fillColor: null,
    };

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          tabIndex={tabIndex}
          className={cn(
            !omitTriggerTopMargin && "mt-1",
            "flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5 pr-3 text-left text-sm text-foreground select-text",
            "hover:bg-muted/60 disabled:opacity-50",
            // Radix adds outline data attribute; keep keyboard focus visible.
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-labelledby={labelId}
        >
          {showSwatch ? <Swatch fillColor={display.fillColor} /> : null}
          <OptionPrimaryLabel
            label={display.label}
            dateLabel={display.dateLabel}
          />
          {display.boardDefault ? <BoardDefaultStar /> : null}
          <ChevronDown className="size-4 shrink-0 opacity-50" strokeWidth={2} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[60] max-h-[min(320px,50vh)] min-w-[12rem] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style={{
            minWidth:
              "max(12rem, var(--radix-dropdown-menu-trigger-width, 0px))",
          }}
          sideOffset={4}
          align="start"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <DropdownMenu.Item
                key={opt.value}
                textValue={
                  opt.dateLabel?.trim()
                    ? `${opt.label} ${opt.dateLabel.trim()}`
                    : opt.label
                }
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  isActive && "bg-accent/40",
                )}
                onSelect={() => onChange(opt.value)}
              >
                {showSwatch ? <Swatch fillColor={opt.fillColor} /> : null}
                <OptionPrimaryLabel
                  label={opt.label}
                  dateLabel={opt.dateLabel}
                />
                {opt.boardDefault ? <BoardDefaultStar /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
