import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Palette } from "lucide-react";
import {
  BOARD_CANVAS_BACKGROUND,
  BOARD_COLOR_PRESETS,
  type BoardColorPreset,
  resolvedBoardColor,
} from "../../../shared/boardColor";
import type { Board } from "../../../shared/models";
import { usePatchBoardViewPrefs } from "@/api/mutations";
import { cn } from "@/lib/utils";

interface BoardColorMenuProps {
  board: Board;
  /** Smaller trigger when board header is compact. */
  compact?: boolean;
}

export function BoardColorMenu({ board, compact = false }: BoardColorMenuProps) {
  const patchViewPrefs = usePatchBoardViewPrefs();
  const current = resolvedBoardColor(board);
  const busy = patchViewPrefs.isPending;

  const pick = (preset: BoardColorPreset) => {
    patchViewPrefs.mutate({
      boardId: board.id,
      patch: { boardColor: preset },
    });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            "inline-flex items-center rounded-md border border-border bg-muted/50 font-medium text-foreground hover:bg-muted disabled:opacity-50",
            compact
              ? "gap-1 px-1.5 py-0.5 text-[11px]"
              : "gap-1.5 px-2 py-1 text-xs",
          )}
          title="Board appearance"
        >
          <Palette
            className={cn("shrink-0", compact ? "size-3" : "size-3.5")}
            aria-hidden
          />
          Board color
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
          sideOffset={6}
          align="start"
        >
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Column area
          </p>
          <div className="grid grid-cols-5 gap-2">
            {BOARD_COLOR_PRESETS.map((preset) => (
              <DropdownMenu.Item
                key={preset}
                className="cursor-pointer rounded-md p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onSelect={() => pick(preset)}
              >
                <span className="sr-only">{preset}</span>
                <span
                  className={
                    current === preset
                      ? "block h-8 w-full rounded border-2 border-border/60 shadow-sm ring-2 ring-ring ring-offset-2 ring-offset-popover"
                      : "block h-8 w-full rounded border-2 border-border/60 shadow-sm"
                  }
                  style={{
                    background: BOARD_CANVAS_BACKGROUND[preset],
                  }}
                  aria-hidden
                />
              </DropdownMenu.Item>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
