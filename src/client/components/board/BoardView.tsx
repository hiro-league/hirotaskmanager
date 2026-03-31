import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  PanelTop,
  Settings2,
} from "lucide-react";
import { useBoard } from "@/api/queries";
import {
  boardCanvasBackground,
  resolvedBoardColor,
} from "../../../shared/boardColor";
import { resolvedBoardLayout } from "../../../shared/models";
import { usePreferencesStore } from "@/store/preferences";
import { BoardColorMenu } from "./BoardColorMenu";
import { BoardColumns } from "./BoardColumns";
import { BoardColumnsStacked } from "./BoardColumnsStacked";
import { BoardLayoutToggle } from "./BoardLayoutToggle";
import { BoardStatusToggles } from "./BoardStatusToggles";
import { TaskGroupSwitcher } from "./TaskGroupSwitcher";
import { TaskGroupsEditorDialog } from "./TaskGroupsEditorDialog";
import { useBoardCanvasPanScroll } from "./useBoardCanvasPanScroll";
import { cn } from "@/lib/utils";

interface BoardViewProps {
  boardId: string | null;
}

export function BoardView({ boardId }: BoardViewProps) {
  const { data, isLoading, isError, error, isFetching } = useBoard(boardId);

  const filterCollapsed = usePreferencesStore(
    (s) => s.boardFilterStripCollapsed,
  );
  const toggleFilterStrip = usePreferencesStore(
    (s) => s.toggleBoardFilterStripCollapsed,
  );

  const [groupsEditorOpen, setGroupsEditorOpen] = useState(false);

  const { scrollRef, panning, boardCanvasPanHandlers } =
    useBoardCanvasPanScroll();

  if (!boardId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium text-foreground">No board selected</p>
        <p className="max-w-sm text-sm">
          Choose a board from the sidebar or create a new one.
        </p>
      </div>
    );
  }

  if (isLoading || (isFetching && !data)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-4 w-72 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Could not load this board."}
        </p>
      </div>
    );
  }

  const boardBg = boardCanvasBackground(resolvedBoardColor(data));
  const stackedLayout = resolvedBoardLayout(data) === "stacked";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg"
      style={{ background: boardBg }}
    >
      <div className="relative shrink-0 border-b border-black/25">
        <div
          className="pointer-events-none absolute inset-0 rounded-t-lg backdrop-brightness-[0.72]"
          aria-hidden
        />
        {/* Tap zone: same 8px as pt-2 below — no extra strip height */}
        <button
          type="button"
          className={cn(
            "absolute inset-x-0 top-0 z-20 h-2 cursor-pointer border-0 bg-transparent p-0",
            "hover:bg-black/[0.06] dark:hover:bg-white/[0.06]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
          )}
          title={
            filterCollapsed
              ? "Show filters (statuses & groups)"
              : "Hide filters & compact header"
          }
          aria-label={
            filterCollapsed
              ? "Expand board header and show filters"
              : "Collapse board header and hide filters"
          }
          onClick={() => toggleFilterStrip()}
        />
        <div
          className={cn(
            "relative z-10 flex flex-col px-6 pt-2",
            filterCollapsed ? "gap-1 pb-2" : "gap-2 pb-3",
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1
              className={cn(
                "min-w-0 flex-1 truncate tracking-tight text-foreground",
                filterCollapsed
                  ? "text-base font-semibold leading-tight"
                  : "text-2xl font-semibold leading-tight",
              )}
            >
              {data.name}
            </h1>
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 font-medium text-foreground hover:bg-muted",
                  filterCollapsed
                    ? "gap-1 px-1.5 py-0.5 text-[11px]"
                    : "px-2 py-1 text-xs",
                )}
                title="Edit task groups for this board"
                onClick={() => setGroupsEditorOpen(true)}
              >
                <Settings2
                  className={cn(
                    "shrink-0",
                    filterCollapsed ? "size-3" : "size-3.5",
                  )}
                  aria-hidden
                />
                Task groups
              </button>
              <BoardColorMenu board={data} compact={filterCollapsed} />
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 font-medium text-foreground hover:bg-muted",
                  filterCollapsed
                    ? "px-1.5 py-0.5 text-[11px]"
                    : "px-2 py-1 text-xs",
                )}
                title={
                  filterCollapsed
                    ? "Show filters (statuses & groups)"
                    : "Hide filters & compact header"
                }
                aria-expanded={!filterCollapsed}
                onClick={() => toggleFilterStrip()}
              >
                <PanelTop
                  className={cn(
                    "shrink-0",
                    filterCollapsed ? "size-3" : "size-3.5",
                  )}
                  aria-hidden
                />
                Filters
                {filterCollapsed ? (
                  <ChevronDown className="size-3 shrink-0" aria-hidden />
                ) : (
                  <ChevronUp className="size-3.5 shrink-0" aria-hidden />
                )}
              </button>
            </div>
          </div>

          {!filterCollapsed ? (
            <div
              className="pointer-events-auto flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-start"
              data-board-no-pan
            >
              <BoardLayoutToggle board={data} />
              <TaskGroupSwitcher board={data} />
              <BoardStatusToggles board={data} />
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto px-3 pb-4 pt-3",
          stackedLayout ? "overflow-y-auto" : "overflow-y-hidden",
          "cursor-grab",
          panning && "cursor-grabbing select-none",
        )}
        {...boardCanvasPanHandlers}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          {stackedLayout ? (
            <BoardColumnsStacked board={data} />
          ) : (
            <BoardColumns board={data} />
          )}
        </div>
      </div>

      <TaskGroupsEditorDialog
        board={data}
        open={groupsEditorOpen}
        onClose={() => setGroupsEditorOpen(false)}
      />
    </div>
  );
}
