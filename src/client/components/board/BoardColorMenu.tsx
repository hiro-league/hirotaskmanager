import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Palette } from "lucide-react";
import {
  BOARD_CANVAS_BACKGROUND,
  BOARD_COLOR_PRESETS,
  type BoardColorPreset,
  resolvedBoardColor,
} from "../../../shared/boardColor";
import type { Board } from "../../../shared/models";
import { useUpdateBoard } from "@/api/mutations";

interface BoardColorMenuProps {
  board: Board;
}

export function BoardColorMenu({ board }: BoardColorMenuProps) {
  const updateBoard = useUpdateBoard();
  const current = resolvedBoardColor(board);
  const busy = updateBoard.isPending;

  const pick = (preset: BoardColorPreset) => {
    updateBoard.mutate({ ...board, boardColor: preset });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          title="Board appearance"
        >
          <Palette className="size-3.5 shrink-0" aria-hidden />
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
