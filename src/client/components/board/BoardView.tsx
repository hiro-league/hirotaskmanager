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
        <div className="relative z-10 flex flex-col gap-2 px-6 pb-3 pt-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {data.name}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                title="Edit task groups for this board"
                onClick={() => setGroupsEditorOpen(true)}
              >
                <Settings2 className="size-3.5 shrink-0" aria-hidden />
                Task groups
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                title={
                  filterCollapsed
                    ? "Show filters (statuses & groups)"
                    : "Hide filters"
                }
                aria-expanded={!filterCollapsed}
                onClick={() => toggleFilterStrip()}
              >
                <PanelTop className="size-3.5 shrink-0" aria-hidden />
                Filters
                {filterCollapsed ? (
                  <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <ChevronUp className="size-3.5 shrink-0" aria-hidden />
                )}
              </button>
              <BoardColorMenu board={data} />
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
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto px-6 pb-4 pt-3",
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
