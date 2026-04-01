import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { useBoard } from "@/api/queries";
import { usePatchBoardName } from "@/api/mutations";
import { resolvedBoardColor } from "../../../shared/boardColor";
import {
  ALL_TASK_GROUPS,
  groupLabelForId,
  resolvedBoardLayout,
  type Board,
} from "../../../shared/models";
import {
  usePreferencesStore,
  useResolvedActiveTaskGroup,
} from "@/store/preferences";
import { resolveDark, useSystemDark } from "@/components/layout/ThemeRoot";
import { BoardColorMenu } from "./BoardColorMenu";
import { BoardColumns } from "./BoardColumns";
import { BoardColumnsStacked } from "./BoardColumnsStacked";
import { BoardLayoutToggle } from "./BoardLayoutToggle";
import { BoardStatusToggles } from "./BoardStatusToggles";
import { BoardTaskCardSizeToggle } from "./BoardTaskCardSizeToggle";
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
import {
  cycleTaskCardViewModeForBoard,
  cycleTaskGroupForBoard,
} from "./shortcuts/boardShortcutRegistry";
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
  const setTaskCardViewModeForBoard = usePreferencesStore(
    (s) => s.setTaskCardViewModeForBoard,
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
      cycleTaskCardViewMode: (b) =>
        cycleTaskCardViewModeForBoard(b, setTaskCardViewModeForBoard),
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
      setTaskCardViewModeForBoard,
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
  const patchBoardName = usePatchBoardName();
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
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  /** Whether the help dialog was opened automatically (on board open) vs via H. */
  const [helpOpenReason, setHelpOpenReason] = useState<
    "none" | "auto" | "manual"
  >("none");
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const boardNameBlurModeRef = useRef<"commit" | "cancel">("commit");

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

  useEffect(() => {
    setEditingBoardName(false);
    setBoardNameDraft(data?.name ?? "");
  }, [data?.id]);

  useEffect(() => {
    if (!editingBoardName) {
      setBoardNameDraft(data?.name ?? "");
    }
  }, [data?.name, editingBoardName]);

  useEffect(() => {
    if (!editingBoardName) return;
    boardNameInputRef.current?.focus();
    boardNameInputRef.current?.select();
  }, [editingBoardName]);

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
  const activeTaskGroup = useResolvedActiveTaskGroup(
    data?.id ?? boardId ?? "",
    data?.taskGroups ?? [],
  );

  const cancelBoardRename = useCallback(() => {
    boardNameBlurModeRef.current = "cancel";
    setEditingBoardName(false);
    setBoardNameDraft(data?.name ?? "");
  }, [data?.name]);

  const commitBoardRename = useCallback(async () => {
    if (!data) return;
    boardNameBlurModeRef.current = "commit";
    setEditingBoardName(false);
    const trimmed = boardNameDraft.trim();
    if (!trimmed || trimmed === data.name) {
      setBoardNameDraft(data.name);
      return;
    }
    try {
      await patchBoardName.mutateAsync({
        boardId: data.id,
        name: trimmed,
      });
    } catch {
      setBoardNameDraft(data.name);
    }
  }, [boardNameDraft, data, patchBoardName]);

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
  const activeGroupLabel =
    activeTaskGroup !== ALL_TASK_GROUPS
      ? groupLabelForId(data.taskGroups, Number(activeTaskGroup))
      : null;

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
        <div
          className={cn(
            "relative z-10 flex flex-col px-6 pt-2",
            filterCollapsed ? "gap-1 pb-2" : "gap-2 pb-3",
          )}
        >
          <div className="grid min-w-0 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="flex min-w-0 items-center gap-2">
              {editingBoardName ? (
                <input
                  ref={boardNameInputRef}
                  type="text"
                  className={cn(
                    "w-full min-w-[12rem] max-w-[28rem] rounded-md border border-input bg-background px-2.5 py-1 text-left text-foreground shadow-sm",
                    filterCollapsed
                      ? "text-base font-semibold leading-tight"
                      : "text-2xl font-semibold leading-tight",
                  )}
                  value={boardNameDraft}
                  disabled={patchBoardName.isPending}
                  onChange={(e) => setBoardNameDraft(e.target.value)}
                  onBlur={() => {
                    if (boardNameBlurModeRef.current === "cancel") {
                      boardNameBlurModeRef.current = "commit";
                      return;
                    }
                    void commitBoardRename();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitBoardRename();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelBoardRename();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={cn(
                    "block max-w-[28rem] truncate rounded-md px-2 py-1 text-left tracking-tight text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.05]",
                    filterCollapsed
                      ? "text-base font-semibold leading-tight"
                      : "text-2xl font-semibold leading-tight",
                  )}
                  title="Rename board"
                  onClick={() => {
                    boardNameBlurModeRef.current = "commit";
                    setBoardNameDraft(data.name);
                    setEditingBoardName(true);
                  }}
                >
                  {data.name}
                </button>
              )}
              {activeGroupLabel ? (
                // Surface the active group near the title so expanded filters read at a glance.
                <div className="hidden min-w-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground sm:inline-flex">
                  <span className="uppercase tracking-wide">Group</span>
                  <span className="truncate font-medium text-foreground">
                    {activeGroupLabel}
                  </span>
                </div>
              ) : null}
            </div>
            {!filterCollapsed ? (
              <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 justify-self-center">
                <BoardColorMenu board={data} compact swatchOnly />
                <BoardLayoutToggle board={data} iconsOnly />
                <BoardTaskCardSizeToggle board={data} />
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  title="Edit task groups for this board"
                  onClick={() => setGroupsEditorOpen(true)}
                >
                  <Settings2 className="size-3.5 shrink-0" aria-hidden />
                  Task groups
                </button>
              </div>
            ) : (
              <div />
            )}
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center justify-self-end rounded-md border border-border bg-muted/50 text-foreground hover:bg-muted"
              title={filterCollapsed ? "Expand header" : "Collapse header"}
              aria-label={filterCollapsed ? "Expand header" : "Collapse header"}
              aria-expanded={!filterCollapsed}
              onClick={() => toggleFilterStrip()}
            >
              {filterCollapsed ? (
                <ChevronDown className="size-4 shrink-0" aria-hidden />
              ) : (
                <ChevronUp className="size-4 shrink-0" aria-hidden />
              )}
            </button>
          </div>

          {!filterCollapsed ? (
            <div
              className="pointer-events-auto flex flex-col gap-2 pt-1"
              data-board-no-pan
            >
              {/* Keep groups and statuses on distinct rows so scanning the active filters is easier. */}
              <div className="flex min-w-0 flex-wrap items-start">
                <TaskGroupSwitcher board={data} />
              </div>
              <div className="flex min-w-0 flex-wrap items-start">
                <BoardStatusToggles board={data} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Prevent native selection on the board surface so drag gestures do not highlight task text. */}
      <div
        ref={scrollRef}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto px-4 pb-4 pt-4 select-none",
          stackedLayout ? "overflow-y-auto" : "overflow-y-hidden",
          "cursor-grab",
          panning && "cursor-grabbing select-none",
        )}
        {...boardCanvasPanHandlers}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-0">
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
