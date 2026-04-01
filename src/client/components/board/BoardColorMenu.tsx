import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Palette } from "lucide-react";
import { useState } from "react";
import {
  BOARD_COLOR_LABELS,
  BOARD_COLOR_PRESETS,
  type BoardColorPreset,
  resolvedBoardColor,
} from "../../../shared/boardColor";
import type { Board } from "../../../shared/models";
import { usePatchBoardViewPrefs } from "@/api/mutations";
import { getBoardThemePreviewBackground } from "./boardTheme";
import { cn } from "@/lib/utils";

interface BoardColorMenuProps {
  board: Board;
  /** Smaller trigger when board header is compact. */
  compact?: boolean;
  /** Swatch-only trigger for tight board-header settings layouts. */
  swatchOnly?: boolean;
}

export function BoardColorMenu({
  board,
  compact = false,
  swatchOnly = false,
}: BoardColorMenuProps) {
  const patchViewPrefs = usePatchBoardViewPrefs();
  const current = resolvedBoardColor(board);
  const busy = patchViewPrefs.isPending;
  // Palette grid stays compact; names appear in the footer only while hovering (or focusing) a swatch.
  const [hoveredPreset, setHoveredPreset] = useState<BoardColorPreset | null>(
    null,
  );

  const pick = (preset: BoardColorPreset) => {
    patchViewPrefs.mutate({
      boardId: board.id,
      patch: { boardColor: preset },
    });
  };

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (!open) setHoveredPreset(null);
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            swatchOnly
              ? "inline-flex rounded-md border border-border/70 bg-transparent p-0.5 shadow-sm hover:border-border hover:bg-transparent disabled:opacity-50"
              : "inline-flex items-center rounded-md border border-border bg-muted/50 font-medium text-foreground hover:bg-muted disabled:opacity-50",
            !swatchOnly &&
              (compact
                ? "gap-1 px-1.5 py-0.5 text-[11px]"
                : "gap-1.5 px-2 py-1 text-xs"),
          )}
          title="Board theme"
          aria-label="Board theme"
        >
          {swatchOnly ? (
            // Mirror the dropdown swatches so the selected theme reads as the control itself.
            <span
              className={cn(
                "block rounded border-2 border-border/60",
                compact ? "h-6 w-6" : "h-7 w-7",
              )}
              style={{ background: getBoardThemePreviewBackground(current) }}
              aria-hidden
            />
          ) : (
            <>
              <Palette
                className={cn("shrink-0", compact ? "size-3" : "size-3.5")}
                aria-hidden
              />
              Board theme
            </>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
          sideOffset={6}
          align="start"
        >
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Board background
          </p>
          <div
            className="grid grid-cols-5 gap-2"
            onMouseLeave={() => setHoveredPreset(null)}
          >
            {BOARD_COLOR_PRESETS.map((preset) => {
              const label = BOARD_COLOR_LABELS[preset];
              const selected = current === preset;
              return (
                <DropdownMenu.Item
                  key={preset}
                  className="cursor-pointer rounded-md p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={label}
                  onSelect={() => pick(preset)}
                  onMouseEnter={() => setHoveredPreset(preset)}
                  onFocus={() => setHoveredPreset(preset)}
                >
                  <span
                    className={cn(
                      "block h-8 w-full rounded border-2 border-border/60 shadow-sm transition-[box-shadow]",
                      selected
                        ? "ring-2 ring-ring ring-offset-2 ring-offset-popover"
                        : "hover:ring-1 hover:ring-border/80",
                    )}
                    style={{
                      background: getBoardThemePreviewBackground(preset),
                    }}
                  />
                </DropdownMenu.Item>
              );
            })}
          </div>
          <div
            className="mt-3 flex min-h-[1.25rem] items-center justify-center border-t border-border/50 pt-2 text-center text-sm font-medium text-foreground"
            aria-live="polite"
          >
            {hoveredPreset != null ? (
              BOARD_COLOR_LABELS[hoveredPreset]
            ) : (
              <span className="text-muted-foreground/25 select-none" aria-hidden>
                ·
              </span>
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
