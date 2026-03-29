import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  PanelTop,
  Settings2,
} from "lucide-react";
import { useBoard } from "@/api/queries";
import { usePreferencesStore } from "@/store/preferences";
import { BoardColumns } from "./BoardColumns";
import { BoardStatusToggles } from "./BoardStatusToggles";
import { TaskGroupSwitcher } from "./TaskGroupSwitcher";
import { TaskGroupsEditorDialog } from "./TaskGroupsEditorDialog";

interface BoardViewProps {
  boardId: string | null;
}

export function BoardView({ boardId }: BoardViewProps) {
  const { data, isLoading, isError, error, isFetching } = useBoard(boardId);
  const prevPhase = useRef<string>("");

  const filterCollapsed = usePreferencesStore(
    (s) => s.boardFilterStripCollapsed,
  );
  const toggleFilterStrip = usePreferencesStore(
    (s) => s.toggleBoardFilterStripCollapsed,
  );

  const [groupsEditorOpen, setGroupsEditorOpen] = useState(false);

  useEffect(() => {
    const phase = !boardId
      ? "no-board-id"
      : isLoading || (isFetching && !data)
        ? "loading"
        : isError || !data
          ? "error-or-no-data"
          : "ready";
    if (phase === prevPhase.current) return;
    prevPhase.current = phase;
    // #region agent log
    fetch("http://127.0.0.1:7317/ingest/4bca21ba-5670-416c-9bf6-209fed4aa1cb", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "bfa499",
      },
      body: JSON.stringify({
        sessionId: "bfa499",
        runId: "post-fix",
        hypothesisId: "H2-H3",
        location: "BoardView.tsx:phase",
        message: "BoardView phase transition",
        data: {
          phase,
          boardId,
          hasData: Boolean(data),
          isError,
          isLoading,
          isFetching,
          err: isError && error instanceof Error ? error.message : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [boardId, data, isError, error, isLoading, isFetching]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-4 pt-5">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border pb-3">
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
          </div>
        </div>

        {!filterCollapsed ? (
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-start">
            <TaskGroupSwitcher board={data} />
            <BoardStatusToggles board={data} />
          </div>
        ) : null}
      </div>

      <div className="mt-3 min-h-0 flex-1 flex flex-col">
        <BoardColumns board={data} />
      </div>

      <TaskGroupsEditorDialog
        board={data}
        open={groupsEditorOpen}
        onClose={() => setGroupsEditorOpen(false)}
      />
    </div>
  );
}
