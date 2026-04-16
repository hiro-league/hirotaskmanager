import { BarChart3 } from "lucide-react";
import type { Board } from "../../../../shared/models";
import { usePatchBoardViewPrefs } from "@/api/mutations";
import { cn } from "@/lib/utils";
import { boardHeaderToggleButtonClass } from "./boardHeaderButtonStyles";

interface BoardStatsVisibilityToggleProps {
  board: Board;
}

/**
 * Toggles persisted `showStats` (SQLite `show_counts`; per-board via view-prefs API), beside card size.
 * Default off — matches product default for the stats chips feature.
 * Icon-only control: full wording lives in the title tooltip (and keyboard shortcut **n**).
 */
export function BoardStatsVisibilityToggle({
  board,
}: BoardStatsVisibilityToggleProps) {
  const patch = usePatchBoardViewPrefs();
  const on = board.showStats;
  const busy = patch.isPending;

  return (
    <button
      type="button"
      className={cn(
        boardHeaderToggleButtonClass(on),
        "size-8 min-w-8 justify-center gap-0 px-0",
      )}
      disabled={busy}
      title="Show/Hide Board Statistics (n)"
      aria-pressed={on}
      aria-label={
        on
          ? "Hide board statistics. Keyboard shortcut n."
          : "Show board statistics. Keyboard shortcut n."
      }
      onClick={() =>
        patch.mutate({ boardId: board.boardId, patch: { showStats: !on } })
      }
    >
      <BarChart3 className="size-3.5 shrink-0" aria-hidden />
    </button>
  );
}
