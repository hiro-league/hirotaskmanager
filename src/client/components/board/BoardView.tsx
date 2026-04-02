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
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Search, Settings2 } from "lucide-react";
import { boardKeys, useBoard } from "@/api/queries";
import { usePatchBoardName } from "@/api/mutations";
import { resolvedBoardColor } from "../../../shared/boardColor";
import {
  ALL_TASK_GROUPS,
  groupLabelForId,
  priorityDisplayLabel,
  priorityLabelForId,
  resolvedBoardLayout,
  sortPrioritiesByValue,
  type Board,
} from "../../../shared/models";
import {
  usePreferencesStore,
  useResolvedActiveTaskGroup,
  useResolvedActiveTaskPriorityIds,
} from "@/store/preferences";
import { resolveDark, useSystemDark } from "@/components/layout/ThemeRoot";
import { BoardColorMenu } from "./BoardColorMenu";
import { BoardColumns } from "./BoardColumns";
import { BoardColumnsStacked } from "./BoardColumnsStacked";
import { BoardLayoutToggle } from "./BoardLayoutToggle";
import { BoardStatusToggles } from "./BoardStatusToggles";
import { BoardPriorityToggles } from "./BoardPriorityToggles";
import { BoardTaskCardSizeToggle } from "./BoardTaskCardSizeToggle";
import { TaskGroupSwitcher } from "./TaskGroupSwitcher";
import { TaskGroupsEditorDialog } from "./TaskGroupsEditorDialog";
import { TaskPrioritiesEditorDialog } from "./TaskPrioritiesEditorDialog";
import {
  BoardKeyboardNavProvider,
  useBoardKeyboardNavOptional,
} from "./shortcuts/BoardKeyboardNavContext";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { useUpdateTask } from "@/api/mutations";
import { BoardTaskKeyboardBridgeProvider } from "./shortcuts/BoardTaskKeyboardBridge";
import { BoardTaskDeleteConfirm } from "./shortcuts/BoardTaskDeleteConfirm";
import {
  cycleTaskCardViewModeForBoard,
  cycleTaskGroupForBoard,
  cycleTaskPriorityForBoard,
} from "./shortcuts/boardShortcutRegistry";
import { ShortcutHelpDialog } from "./shortcuts/ShortcutHelpDialog";
import { ShortcutScopeProvider } from "./shortcuts/ShortcutScopeContext";
import { useBoardShortcutKeydown } from "./shortcuts/useBoardShortcutKeydown";
import { useBoardTaskKeyboardBridgeOptional } from "./shortcuts/BoardTaskKeyboardBridge";
import type { BoardShortcutActions } from "./shortcuts/boardShortcutTypes";
import { useBoardCanvasPanScroll } from "./useBoardCanvasPanScroll";
import { getBoardThemeStyle } from "./boardTheme";
import { cn } from "@/lib/utils";
import { useBoardSearch } from "@/context/BoardSearchContext";
import { boardHeaderActionButtonClass } from "./boardHeaderButtonStyles";
import { BoardSearchDialog } from "./BoardSearchDialog";

interface BoardViewProps {
  boardId: string | null;
}

/** Lives inside BoardKeyboardNavProvider — merges board shortcuts with highlight navigation and task actions. */
function BoardShortcutBindings({
  board,
  openHelp,
  openBoardSearch,
  toggleFilters,
  setTaskDeleteConfirmId,
}: {
  board: Board;
  openHelp: () => void;
  openBoardSearch: () => void;
  toggleFilters: () => void;
  setTaskDeleteConfirmId: Dispatch<SetStateAction<number | null>>;
}) {
  const setActiveTaskGroupForBoard = usePreferencesStore(
    (s) => s.setActiveTaskGroupForBoard,
  );
  const setTaskCardViewModeForBoard = usePreferencesStore(
    (s) => s.setTaskCardViewModeForBoard,
  );
  const setActiveTaskPriorityIdsForBoard = usePreferencesStore(
    (s) => s.setActiveTaskPriorityIdsForBoard,
  );
  const nav = useBoardKeyboardNavOptional();
  const bridge = useBoardTaskKeyboardBridgeOptional();
  const { data: statuses } = useStatuses();
  const workflowOrder = useStatusWorkflowOrder();
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();
  const pendingPrioritySavesRef = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );
  const pendingPriorityTasksRef = useRef(new Map<number, Board["tasks"][number]>());

  useEffect(() => {
    return () => {
      for (const timeoutId of pendingPrioritySavesRef.current.values()) {
        clearTimeout(timeoutId);
      }
      pendingPrioritySavesRef.current.clear();
      pendingPriorityTasksRef.current.clear();
    };
  }, []);

  const actions = useMemo<BoardShortcutActions>(
    () => ({
      openHelp,
      openBoardSearch,
      toggleFilters,
      cycleTaskCardViewMode: (b) =>
        cycleTaskCardViewModeForBoard(b, setTaskCardViewModeForBoard),
      cycleTaskGroup: (b) =>
        cycleTaskGroupForBoard(b, setActiveTaskGroupForBoard),
      allTaskGroups: (b) =>
        setActiveTaskGroupForBoard(b.id, ALL_TASK_GROUPS),
      cycleTaskPriority: (b) =>
        cycleTaskPriorityForBoard(b, setActiveTaskPriorityIdsForBoard),
      cycleHighlightedTaskPriority: (b) => {
        const highlightedTaskId = nav?.highlightedTaskId;
        if (highlightedTaskId == null) return;
        const currentBoard =
          queryClient.getQueryData<Board>(boardKeys.detail(b.id)) ?? b;
        const task = currentBoard.tasks.find((entry) => entry.id === highlightedTaskId);
        if (!task) return;
        const priorityOrder = [
          null,
          ...sortPrioritiesByValue(currentBoard.taskPriorities).map(
            (priority) => priority.id,
          ),
        ];
        const currentPriorityId = task.priorityId ?? null;
        const currentIndex = Math.max(
          0,
          priorityOrder.findIndex((priorityId) => priorityId === currentPriorityId),
        );
        const nextPriorityId =
          priorityOrder[(currentIndex + 1) % priorityOrder.length] ?? null;
        const nextTask = {
          ...task,
          priorityId: nextPriorityId,
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueryData<Board>(boardKeys.detail(currentBoard.id), {
          ...currentBoard,
          tasks: currentBoard.tasks.map((entry) =>
            entry.id === nextTask.id ? nextTask : entry,
          ),
          updatedAt: nextTask.updatedAt,
        });
        pendingPriorityTasksRef.current.set(nextTask.id, nextTask);
        const existingTimeout = pendingPrioritySavesRef.current.get(nextTask.id);
        if (existingTimeout !== undefined) {
          clearTimeout(existingTimeout);
        }
        // Delay the PATCH so rapid P presses only persist the final choice.
        const timeoutId = setTimeout(() => {
          const pendingTask = pendingPriorityTasksRef.current.get(nextTask.id);
          pendingPriorityTasksRef.current.delete(nextTask.id);
          pendingPrioritySavesRef.current.delete(nextTask.id);
          if (!pendingTask) return;
          const latestBoard =
            queryClient.getQueryData<Board>(boardKeys.detail(currentBoard.id)) ??
            currentBoard;
          const latestTask =
            latestBoard.tasks.find((entry) => entry.id === pendingTask.id) ?? pendingTask;
          updateTask.mutate({
            boardId: latestBoard.id,
            task: {
              ...latestTask,
              priorityId: pendingTask.priorityId,
              updatedAt: pendingTask.updatedAt,
            },
          });
        }, 1000);
        pendingPrioritySavesRef.current.set(nextTask.id, timeoutId);
      },
      focusOrScrollHighlight: () => nav?.focusOrScrollHighlight(),
      moveHighlight: (dir) => nav?.moveHighlight(dir),
      highlightHome: () => nav?.highlightHome(),
      highlightEnd: () => nav?.highlightEnd(),
      highlightPage: (dir) => nav?.highlightPage(dir),
      openHighlightedTask: () => {
        const id = nav?.highlightedTaskId;
        if (id != null) bridge?.requestOpenTaskEditor(id);
      },
      requestDeleteHighlightedTask: () => {
        const id = nav?.highlightedTaskId;
        if (id != null) setTaskDeleteConfirmId(id);
      },
      completeHighlightedTask: (b) => {
        const id = nav?.highlightedTaskId;
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
        const id = nav?.highlightedTaskId;
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
      openBoardSearch,
      toggleFilters,
      setTaskCardViewModeForBoard,
      setActiveTaskGroupForBoard,
      setActiveTaskPriorityIdsForBoard,
      nav,
      bridge,
      queryClient,
      setTaskDeleteConfirmId,
      statuses,
      workflowOrder,
      updateTask,
    ],
  );

  useBoardShortcutKeydown({
    board: nav && bridge ? board : null,
    actions,
  });
  return null;
}

export function BoardView({ boardId }: BoardViewProps) {
  const { data, isLoading, isError, error, isFetching } = useBoard(boardId);
  const { open: boardSearchOpen, openSearch, closeSearch } = useBoardSearch();
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
  const [prioritiesEditorOpen, setPrioritiesEditorOpen] = useState(false);
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

  useEffect(() => {
    closeSearch();
  }, [boardId, closeSearch]);

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
  const activeTaskPriorityIds = useResolvedActiveTaskPriorityIds(
    data?.id ?? boardId ?? "",
    data?.taskPriorities ?? [],
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
  const activePriorityLabel =
    activeTaskPriorityIds && activeTaskPriorityIds.length === 1
      ? priorityLabelForId(data.taskPriorities, Number(activeTaskPriorityIds[0]))
      : null;
  const activePrioritySummary =
    activeTaskPriorityIds === null
      ? null
      : activeTaskPriorityIds.length === 0
        ? "None"
        : activeTaskPriorityIds.length === 1
          ? activePriorityLabel
            ? priorityDisplayLabel(activePriorityLabel)
            : null
          : `${activeTaskPriorityIds.length} selected`;
  const activePriorityColor =
    activeTaskPriorityIds && activeTaskPriorityIds.length === 1
      ? sortPrioritiesByValue(data.taskPriorities).find(
          (priority) => String(priority.id) === activeTaskPriorityIds[0],
        )?.color
      : undefined;

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
        openBoardSearch={openSearch}
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
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-foreground hover:bg-muted"
                title="Search tasks (K or F3)"
                aria-label="Search tasks on this board"
                onClick={() => openSearch()}
              >
                <Search className="size-4 shrink-0" aria-hidden />
              </button>
              {activeGroupLabel ? (
                // Surface the active group near the title so expanded filters read at a glance.
                <div className="hidden min-w-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground sm:inline-flex">
                  <span className="uppercase tracking-wide">Group</span>
                  <span className="truncate font-medium text-foreground">
                    {activeGroupLabel}
                  </span>
                </div>
              ) : null}
              {activePrioritySummary ? (
                <div className="hidden min-w-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground sm:inline-flex">
                  <span className="uppercase tracking-wide">Priority</span>
                  {activePriorityColor ? (
                    <span
                      className="size-2.5 shrink-0 rounded-full border border-black/30"
                      style={{ backgroundColor: activePriorityColor }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="truncate font-medium text-foreground">
                    {activePrioritySummary}
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
                  className={boardHeaderActionButtonClass()}
                  title="Edit task groups for this board"
                  onClick={() => setGroupsEditorOpen(true)}
                >
                  <Settings2 className="size-3.5 shrink-0" aria-hidden />
                  Task groups
                </button>
                <button
                  type="button"
                  className={boardHeaderActionButtonClass()}
                  title="Edit task priorities for this board"
                  onClick={() => setPrioritiesEditorOpen(true)}
                >
                  <Settings2 className="size-3.5 shrink-0" aria-hidden />
                  Task priorities
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
              {/* Keep the two task-metadata filters on one row so they read as peers. */}
              <div className="flex min-w-0 flex-wrap items-start gap-4">
                <TaskGroupSwitcher board={data} />
                <BoardPriorityToggles board={data} />
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

      <BoardSearchDialog
        board={data}
        open={boardSearchOpen}
        onClose={closeSearch}
      />

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

      <TaskPrioritiesEditorDialog
        board={data}
        open={prioritiesEditorOpen}
        onClose={() => setPrioritiesEditorOpen(false)}
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
