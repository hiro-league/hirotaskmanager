import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  PanelTop,
  Settings2,
} from "lucide-react";
import { useBoard } from "@/api/queries";
import { resolvedBoardColor } from "../../../shared/boardColor";
import {
  ALL_TASK_GROUPS,
  resolvedBoardLayout,
  type Board,
} from "../../../shared/models";
import { usePreferencesStore } from "@/store/preferences";
import { resolveDark, useSystemDark } from "@/components/layout/ThemeRoot";
import { BoardColorMenu } from "./BoardColorMenu";
import { BoardColumns } from "./BoardColumns";
import { BoardColumnsStacked } from "./BoardColumnsStacked";
import { BoardLayoutToggle } from "./BoardLayoutToggle";
import { BoardStatusToggles } from "./BoardStatusToggles";
import { TaskGroupSwitcher } from "./TaskGroupSwitcher";
import { TaskGroupsEditorDialog } from "./TaskGroupsEditorDialog";
import {
  BoardKeyboardNavProvider,
  useBoardKeyboardNav,
} from "./shortcuts/BoardKeyboardNavContext";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { useUpdateTask } from "@/api/mutations";
import { BoardTaskKeyboardBridgeProvider } from "./shortcuts/BoardTaskKeyboardBridge";
import { BoardTaskDeleteConfirm } from "./shortcuts/BoardTaskDeleteConfirm";
import { cycleTaskGroupForBoard } from "./shortcuts/boardShortcutRegistry";
import { ShortcutHelpDialog } from "./shortcuts/ShortcutHelpDialog";
import { ShortcutScopeProvider } from "./shortcuts/ShortcutScopeContext";
import { useBoardShortcutKeydown } from "./shortcuts/useBoardShortcutKeydown";
import { useBoardTaskKeyboardBridge } from "./shortcuts/BoardTaskKeyboardBridge";
import type { BoardShortcutActions } from "./shortcuts/boardShortcutTypes";
import { useBoardCanvasPanScroll } from "./useBoardCanvasPanScroll";
import { getBoardThemeStyle } from "./boardTheme";
import { cn } from "@/lib/utils";

interface BoardViewProps {
  boardId: string | null;
}

/** Lives inside BoardKeyboardNavProvider — merges board shortcuts with highlight navigation and task actions. */
function BoardShortcutBindings({
  board,
  openHelp,
  toggleFilters,
  setTaskDeleteConfirmId,
}: {
  board: Board;
  openHelp: () => void;
  toggleFilters: () => void;
  setTaskDeleteConfirmId: Dispatch<SetStateAction<number | null>>;
}) {
  const setActiveTaskGroupForBoard = usePreferencesStore(
    (s) => s.setActiveTaskGroupForBoard,
  );
  const nav = useBoardKeyboardNav();
  const bridge = useBoardTaskKeyboardBridge();
  const { data: statuses } = useStatuses();
  const workflowOrder = useStatusWorkflowOrder();
  const updateTask = useUpdateTask();

  const actions = useMemo<BoardShortcutActions>(
    () => ({
      openHelp,
      toggleFilters,
      cycleTaskGroup: (b) =>
        cycleTaskGroupForBoard(b, setActiveTaskGroupForBoard),
      allTaskGroups: (b) =>
        setActiveTaskGroupForBoard(b.id, ALL_TASK_GROUPS),
      focusOrScrollHighlight: nav.focusOrScrollHighlight,
      moveHighlight: nav.moveHighlight,
      highlightHome: nav.highlightHome,
      highlightEnd: nav.highlightEnd,
      highlightPage: nav.highlightPage,
      openHighlightedTask: () => {
        const id = nav.highlightedTaskId;
        if (id != null) bridge.requestOpenTaskEditor(id);
      },
      requestDeleteHighlightedTask: () => {
        const id = nav.highlightedTaskId;
        if (id != null) setTaskDeleteConfirmId(id);
      },
      completeHighlightedTask: (b) => {
        const id = nav.highlightedTaskId;
        if (id == null) return;
        const task = b.tasks.find((t) => t.id === id);
        if (!task) return;
        const meta = statuses?.find((s) => s.id === task.status);
        if (meta?.isClosed) return;
        const closedId = statuses?.find((s) => s.isClosed)?.id ?? "closed";
        const now = new Date().toISOString();
        updateTask.mutate({
          boardId: b.id,
          task: {
            ...task,
            status: closedId,
            updatedAt: now,
            closedAt: task.closedAt ?? now,
          },
        });
      },
      reopenHighlightedTask: (b) => {
        const id = nav.highlightedTaskId;
        if (id == null) return;
        const task = b.tasks.find((t) => t.id === id);
        if (!task) return;
        const meta = statuses?.find((s) => s.id === task.status);
        if (!meta?.isClosed) return;
        const openId =
          workflowOrder.find((x) => x === "open") ?? workflowOrder[0] ?? "open";
        const now = new Date().toISOString();
        updateTask.mutate({
          boardId: b.id,
          task: {
            ...task,
            status: openId,
            updatedAt: now,
            closedAt: null,
          },
        });
      },
    }),
    [
      openHelp,
      toggleFilters,
      setActiveTaskGroupForBoard,
      nav,
      bridge,
      setTaskDeleteConfirmId,
      statuses,
      workflowOrder,
      updateTask,
    ],
  );

  useBoardShortcutKeydown({ board, actions });
  return null;
}

export function BoardView({ boardId }: BoardViewProps) {
  const { data, isLoading, isError, error, isFetching } = useBoard(boardId);
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const systemDark = useSystemDark();
  const dark = resolveDark(themePreference, systemDark);

  const filterCollapsed = usePreferencesStore(
    (s) => s.boardFilterStripCollapsed,
  );
  const toggleFilterStrip = usePreferencesStore(
    (s) => s.toggleBoardFilterStripCollapsed,
  );
  const boardShortcutHelpDismissed = usePreferencesStore(
    (s) => s.boardShortcutHelpDismissed,
  );
  const setBoardShortcutHelpDismissed = usePreferencesStore(
    (s) => s.setBoardShortcutHelpDismissed,
  );

  const [groupsEditorOpen, setGroupsEditorOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  /** Whether the help dialog was opened automatically (on board open) vs via H. */
  const [helpOpenReason, setHelpOpenReason] = useState<
    "none" | "auto" | "manual"
  >("none");

  const openHelp = useCallback(() => {
    setHelpOpenReason("manual");
    setShortcutHelpOpen(true);
  }, []);

  const { scrollRef, panning, boardCanvasPanHandlers } =
    useBoardCanvasPanScroll();

  // Auto-open keyboard help whenever a board is selected from the sidebar, until the user
  // checks "Don't show again" (`boardShortcutHelpDismissed`). Closing without the checkbox
  // does not persist — the dialog shows again on the next board open.
  useEffect(() => {
    if (!data || !boardId) return;
    if (boardShortcutHelpDismissed) return;
    setHelpOpenReason("auto");
    setShortcutHelpOpen(true);
  }, [boardId, data?.id, boardShortcutHelpDismissed]);

  const handleShortcutHelpClose = useCallback(
    (result?: { dontShowAgain: boolean }) => {
      setShortcutHelpOpen(false);
      setHelpOpenReason("none");
      if (result?.dontShowAgain) setBoardShortcutHelpDismissed(true);
    },
    [setBoardShortcutHelpDismissed],
  );

  const [taskDeleteConfirmId, setTaskDeleteConfirmId] = useState<number | null>(
    null,
  );

  // Compute this without a hook so BoardView keeps the same hook order while it
  // moves between empty/loading/error/success states.
  const boardThemeStyle: CSSProperties = {
    ...getBoardThemeStyle(resolvedBoardColor(data ?? {}), dark),
    background: "var(--board-canvas-image)",
  };

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
  const stackedLayout = resolvedBoardLayout(data) === "stacked";

  return (
    <ShortcutScopeProvider>
    <BoardTaskKeyboardBridgeProvider>
    <BoardKeyboardNavProvider
      board={data}
      layout={stackedLayout ? "stacked" : "lanes"}
    >
      <BoardShortcutBindings
        board={data}
        openHelp={openHelp}
        toggleFilters={toggleFilterStrip}
        setTaskDeleteConfirmId={setTaskDeleteConfirmId}
      />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg"
        style={boardThemeStyle}
      >
      <div
        className="relative shrink-0 border-b"
        // Keep board identity on the top strip only; the controls inside it
        // still use the shared app theme so the rest of the UI stays familiar.
        style={{
          background: "var(--board-header-bg)",
          borderBottomColor: "var(--board-header-border)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-t-lg "
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

      {/* Prevent native selection on the board surface so drag gestures do not highlight task text. */}
      <div
        ref={scrollRef}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto px-3 pb-4 pt-3 select-none",
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

      <ShortcutHelpDialog
        open={shortcutHelpOpen}
        onClose={handleShortcutHelpClose}
        showOnboardingExtras={helpOpenReason === "auto"}
      />

      <TaskGroupsEditorDialog
        board={data}
        open={groupsEditorOpen}
        onClose={() => setGroupsEditorOpen(false)}
      />

      <BoardTaskDeleteConfirm
        board={data}
        taskId={taskDeleteConfirmId}
        onClose={() => setTaskDeleteConfirmId(null)}
      />
    </div>
    </BoardKeyboardNavProvider>
    </BoardTaskKeyboardBridgeProvider>
    </ShortcutScopeProvider>
  );
}
