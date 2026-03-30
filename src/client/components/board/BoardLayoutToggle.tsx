import type { PointerEvent } from "react";
import { Columns3, LayoutList } from "lucide-react";
import {
  type Board,
  type BoardLayout,
  resolvedBoardLayout,
} from "../../../shared/models";
import { usePatchBoardViewPrefs } from "@/api/mutations";
import { cn } from "@/lib/utils";

interface BoardLayoutToggleProps {
  board: Board;
}

export function BoardLayoutToggle({ board }: BoardLayoutToggleProps) {
  const patchViewPrefs = usePatchBoardViewPrefs();
  const mode = resolvedBoardLayout(board);

  const setMode = (next: BoardLayout) => {
    if (next === mode) return;
    patchViewPrefs.mutate({
      boardId: board.id,
      patch: { boardLayout: next },
    });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Board layout"
    >
      <span className="text-xs font-medium text-muted-foreground">Layout</span>
      <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
            mode === "lanes"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={mode === "lanes"}
          title="Status lanes — full height columns split by status"
          onPointerDown={(e: PointerEvent<HTMLButtonElement>) =>
            e.stopPropagation()
          }
          onClick={() => setMode("lanes")}
        >
          <Columns3 className="size-3.5 shrink-0" aria-hidden />
          Lanes
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
            mode === "stacked"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={mode === "stacked"}
          title="Stacked — one list of tasks per column"
          onPointerDown={(e: PointerEvent<HTMLButtonElement>) =>
            e.stopPropagation()
          }
          onClick={() => setMode("stacked")}
        >
          <LayoutList className="size-3.5 shrink-0" aria-hidden />
          Stacked
        </button>
      </div>
    </div>
  );
}
