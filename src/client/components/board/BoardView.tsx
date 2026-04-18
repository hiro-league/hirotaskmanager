import {
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { useBoardStats, useSuspenseBoard } from "@/api/queries";
import { useBoardChangeStream } from "@/api/useBoardChangeStream";
import { usePatchBoard } from "@/api/mutations";
import { resolveDark, useSystemDark } from "@/components/layout/ThemeRoot";
import {
  BoardDialogsProvider,
  useBoardDialogs,
} from "@/context/BoardDialogsContext";
import { BoardFilterResolutionProvider } from "@/context/BoardFilterResolutionContext";
import { BoardEditingProvider } from "@/context/BoardEditingContext";
import { useBoardSearch } from "@/context/BoardSearchContext";
import {
  useBoardFiltersStore,
  usePreferencesStore,
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskCardViewMode,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import { resolvedBoardColor } from "../../../shared/boardColor";
import type { BoardStatsFilter, TaskCountStat } from "../../../shared/boardStats";
import { type Board, resolvedBoardLayout } from "../../../shared/models";
import { BoardCanvas } from "./BoardCanvas";
import { BoardColumnsResolved } from "./columns/BoardColumnsResolved";
import { BoardLayoutProvider } from "@/context/BoardLayoutContext";
import { BoardEditDialog } from "./dialogs/BoardEditDialog";
import { BoardHeader } from "./header/BoardHeader";
import { BoardNotificationDeepLink } from "./BoardNotificationDeepLink";
import { BoardSearchDialog } from "./dialogs/BoardSearchDialog";
import {
  BoardStatsDisplayProvider,
  type BoardStatsDisplayValue,
} from "./BoardStatsContext";
import { BoardShortcutBindings } from "./BoardShortcutBindings";
import {
  boardHasClearableTaskFilters,
  buildBoardFilterSummaries,
} from "./boardFilterSummaries";
import { getBoardThemeStyle } from "./boardTheme";
import { ReleasesEditorDialog } from "./dialogs/ReleasesEditorDialog";
import {
  BoardKeyboardNavProvider,
} from "./shortcuts/BoardKeyboardNavContext";
import { BoardListDeleteConfirm } from "./shortcuts/BoardListDeleteConfirm";
import { BoardTaskDeleteConfirm } from "./shortcuts/BoardTaskDeleteConfirm";
import { ShortcutHelpDialog } from "./shortcuts/ShortcutHelpDialog";
import { ShortcutScopeProvider } from "./shortcuts/ShortcutScopeContext";
import { BoardTaskKeyboardBridgeProvider } from "./shortcuts/BoardTaskKeyboardBridge";
import { TaskGroupsEditorDialog } from "./dialogs/TaskGroupsEditorDialog";
import { TaskPrioritiesEditorDialog } from "./dialogs/TaskPrioritiesEditorDialog";
import { useBoardCanvasPanScroll } from "./useBoardCanvasPanScroll";
import { useBoardHeaderScrollMetrics } from "./useBoardHeaderScrollMetrics";
import {
  BoardTaskCompletionCelebrationProvider,
} from "@/gamification";
import { RedirectCountdownNotice } from "@/components/routing/RedirectCountdownNotice";
import { BoardQueryErrorBoundary } from "./BoardQueryErrorBoundary";

function BoardViewLoadingFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-8">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mt-4 h-4 w-72 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

interface BoardViewProps {
  boardId: string | null;
}

export function BoardView({ boardId }: BoardViewProps) {
  const { closeSearch } = useBoardSearch();

  useEffect(() => {
    closeSearch();
  }, [boardId, closeSearch]);

  if (!boardId) {
    return (
      <RedirectCountdownNotice
        title="No board selected"
        description="Choose a board from the sidebar or create a new one."
      />
    );
  }

  return (
    <BoardQueryErrorBoundary key={boardId}>
      <Suspense fallback={<BoardViewLoadingFallback />}>
        <BoardViewBody boardId={boardId} />
      </Suspense>
    </BoardQueryErrorBoundary>
  );
}

function BoardViewBody({ boardId }: { boardId: string }) {
  const { data } = useSuspenseBoard(boardId);
  useBoardChangeStream(boardId, data.boardId);
  const { open: boardSearchOpen, openSearch, closeSearch } = useBoardSearch();
  const patchBoard = usePatchBoard();
  const { themePreference, filterCollapsed, toggleFilterStrip: toggleFilterStripStore } =
    usePreferencesStore(
      useShallow((s) => ({
        themePreference: s.themePreference,
        filterCollapsed: s.boardFilterStripCollapsed,
        toggleFilterStrip: s.toggleBoardFilterStripCollapsed,
      })),
    );
  const systemDark = useSystemDark();
  const dark = resolveDark(themePreference, systemDark);
  const stackedLayout = resolvedBoardLayout(data) === "stacked";

  const toggleFilterStrip = useCallback(() => {
    startTransition(() => toggleFilterStripStore());
  }, [toggleFilterStripStore]);
  const [statsEntryToken, setStatsEntryToken] = useState(0);
  const [boardEmojiFieldError, setBoardEmojiFieldError] = useState<string | null>(
    null,
  );
  const boardHeaderRef = useRef<HTMLDivElement>(null);

  const { scrollRef, boardCanvasPanHandlers } = useBoardCanvasPanScroll();
  const headerScroll = useBoardHeaderScrollMetrics({
    boardId: data.boardId,
    stackedLayout,
    scrollRef,
    headerRef: boardHeaderRef,
  });

  const [taskDeleteConfirmId, setTaskDeleteConfirmId] = useState<number | null>(
    null,
  );
  const [listDeleteConfirmId, setListDeleteConfirmId] = useState<number | null>(
    null,
  );
  const activeTaskGroupIds = useResolvedActiveTaskGroupIds(
    String(data.boardId),
    data.taskGroups,
  );
  const activeTaskPriorityIds = useResolvedActiveTaskPriorityIds(
    String(data.boardId),
    data.taskPriorities,
  );
  const activeReleaseIds = useResolvedActiveReleaseIds(
    String(data.boardId),
    data.releases,
  );
  const dateFilterResolved = useResolvedTaskDateFilter(String(data.boardId));
  const taskCardViewMode = useResolvedTaskCardViewMode(String(data.boardId));
  const setActiveReleaseIdsForBoard = useBoardFiltersStore(
    (s) => s.setActiveReleaseIdsForBoard,
  );
  const clearTaskFiltersForBoard = useBoardFiltersStore(
    (s) => s.clearTaskFiltersForBoard,
  );

  const boardFilterResolution = useMemo(
    () => ({
      activeGroupIds: activeTaskGroupIds,
      activePriorityIds: activeTaskPriorityIds,
      activeReleaseIds: activeReleaseIds,
      dateFilterResolved,
      taskCardViewMode,
    }),
    [
      activeTaskGroupIds,
      activeTaskPriorityIds,
      activeReleaseIds,
      dateFilterResolved,
      taskCardViewMode,
    ],
  );

  const prevStatsVisibleRef = useRef<boolean | null>(null);

  useEffect(() => {
    const visible = Boolean(data.showStats);
    if (prevStatsVisibleRef.current === null) {
      prevStatsVisibleRef.current = visible;
      return;
    }
    if (visible && !prevStatsVisibleRef.current) {
      setStatsEntryToken((value) => value + 1);
    }
    prevStatsVisibleRef.current = visible;
  }, [data.showStats]);

  const statsFilter = useMemo((): BoardStatsFilter | null => {
    return {
      activeGroupIds: activeTaskGroupIds,
      activePriorityIds: activeTaskPriorityIds,
      activeReleaseIds,
      dateFilter: dateFilterResolved,
    };
  }, [
    activeTaskGroupIds,
    activeTaskPriorityIds,
    activeReleaseIds,
    dateFilterResolved,
  ]);

  const boardStatsQuery = useBoardStats(data.boardId, statsFilter, {
    enabled: Boolean(data.showStats),
  });

  /** O(1) per column vs `.find` per list (react-best-practices P4.2). */
  const listStatsByListId = useMemo(() => {
    if (!data.showStats) return null;
    const lists = boardStatsQuery.data?.lists;
    if (!lists) return new Map<number, TaskCountStat>();
    return new Map(lists.map((e) => [e.listId, e.stats]));
  }, [data.showStats, boardStatsQuery.data?.lists]);

  const boardStatsDisplay = useMemo((): BoardStatsDisplayValue => {
    if (!data.showStats) {
      const empty: TaskCountStat = { total: 0, open: 0, closed: 0 };
      return {
        board: null,
        listStat: () => empty,
        entryToken: statsEntryToken,
        fetching: false,
        pending: false,
        showChipSpinner: false,
        statsError: false,
      };
    }
    const query = boardStatsQuery;
    const statsError = query.isError;
    const emptyListStat: TaskCountStat = { total: 0, open: 0, closed: 0 };
    return {
      board: statsError ? null : (query.data?.board ?? null),
      listStat: (listId: number) =>
        statsError || !listStatsByListId
          ? emptyListStat
          : (listStatsByListId.get(listId) ?? emptyListStat),
      entryToken: statsEntryToken,
      fetching: query.isFetching,
      pending: query.isPending,
      showChipSpinner:
        query.isPending || (query.isFetching && query.isPlaceholderData),
      statsError,
    };
  }, [data.showStats, boardStatsQuery, listStatsByListId, statsEntryToken]);

  const pickBoardEmoji = useCallback(
    async (next: string | null) => {
      setBoardEmojiFieldError(null);
      try {
        await patchBoard.mutateAsync({
          boardId: data.boardId,
          emoji: next,
        });
      } catch {
        /* server rejected; cache rolls back via mutation onError */
      }
    },
    [data, patchBoard],
  );

  const boardThemeStyle = useMemo(
    (): CSSProperties => ({
      ...getBoardThemeStyle(resolvedBoardColor(data), dark),
      background: "var(--board-canvas-image)",
    }),
    [data, dark],
  );
  const boardSurfaceId = `board-surface-${data.boardId}`;
  const boardStats = boardStatsQuery.data?.board ?? {
    total: 0,
    open: 0,
    closed: 0,
  };

  const filterSummaries = buildBoardFilterSummaries(
    data,
    activeTaskGroupIds,
    activeTaskPriorityIds,
    activeReleaseIds,
    dateFilterResolved,
  );

  const defaultReleaseChip = useMemo(() => {
    if (!filterSummaries.defaultRelease) return null;
    return {
      patchBoardPending: patchBoard.isPending,
      autoAssignUiOn: data.autoAssignReleaseOnCreateUi,
      onToggleAutoAssignUi: async () => {
        try {
          await patchBoard.mutateAsync({
            boardId: data.boardId,
            autoAssignReleaseOnCreateUi: !data.autoAssignReleaseOnCreateUi,
          });
        } catch {
          /* server rejected; cache rolls back via mutation onError */
        }
      },
      onFilterToDefaultRelease: () => {
        if (data.defaultReleaseId == null) return;
        startTransition(() =>
          setActiveReleaseIdsForBoard(data.boardId, [
            String(data.defaultReleaseId),
          ]),
        );
      },
    };
  }, [
    data.autoAssignReleaseOnCreateUi,
    data.boardId,
    data.defaultReleaseId,
    filterSummaries.defaultRelease,
    patchBoard,
    setActiveReleaseIdsForBoard,
  ]);

  const clearableTaskFilters = useMemo(
    () =>
      boardHasClearableTaskFilters(
        activeTaskGroupIds,
        activeTaskPriorityIds,
        activeReleaseIds,
        dateFilterResolved,
      ),
    [
      activeTaskGroupIds,
      activeTaskPriorityIds,
      activeReleaseIds,
      dateFilterResolved,
    ],
  );

  const handleClearTaskFilters = useCallback(() => {
    startTransition(() => clearTaskFiltersForBoard(data.boardId));
  }, [clearTaskFiltersForBoard, data.boardId]);

  return (
    <ShortcutScopeProvider>
      <BoardStatsDisplayProvider value={boardStatsDisplay}>
        <BoardLayoutProvider
          boardId={data.boardId}
          layout={stackedLayout ? "stacked" : "lanes"}
        >
          <BoardTaskKeyboardBridgeProvider>
            <BoardFilterResolutionProvider value={boardFilterResolution}>
              <BoardKeyboardNavProvider board={data}>
                <BoardTaskCompletionCelebrationProvider
                  celebrationSoundsMuted={data.muteCelebrationSounds}
                >
                  <BoardDialogsProvider board={data}>
                    <BoardShortcutBindings
                      boardId={data.boardId}
                      boardLayout={data.boardLayout}
                      defaultReleaseId={data.defaultReleaseId}
                      releases={data.releases}
                      showStats={data.showStats}
                      taskGroups={data.taskGroups}
                      taskPriorities={data.taskPriorities}
                      tasks={data.tasks}
                      openBoardSearch={openSearch}
                      toggleFilters={toggleFilterStrip}
                      setTaskDeleteConfirmId={setTaskDeleteConfirmId}
                      setListDeleteConfirmId={setListDeleteConfirmId}
                    />
                    <BoardNotificationDeepLink board={data} />
                    <div
                      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg"
                      style={boardThemeStyle}
                    >
                      <BoardEditingProvider key={data.boardId} board={data}>
                        <BoardHeader
                          board={data}
                          shell={{
                            boardHeaderRef,
                            headerScroll,
                            filterCollapsed,
                            toggleFilterStrip,
                          }}
                          surface={{ boardSurfaceId }}
                          emoji={{
                            boardEmojiFieldError,
                            onBoardEmojiValidationError: setBoardEmojiFieldError,
                            patchBoardPending: patchBoard.isPending,
                            pickBoardEmoji,
                          }}
                          filters={{
                            filterSummaries,
                            defaultReleaseChip,
                            onClearTaskFilters: clearableTaskFilters
                              ? handleClearTaskFilters
                              : undefined,
                          }}
                          stats={{
                            boardStatsDisplay,
                            boardStats,
                          }}
                        />
                      </BoardEditingProvider>

                      <BoardCanvas
                        boardSurfaceId={boardSurfaceId}
                        scrollRef={scrollRef}
                        boardCanvasPanHandlers={boardCanvasPanHandlers}
                      >
                        <BoardColumnsResolved board={data} />
                      </BoardCanvas>

                      <BoardViewDialogs
                        board={data}
                        boardSearchOpen={boardSearchOpen}
                        closeSearch={closeSearch}
                        taskDeleteConfirmId={taskDeleteConfirmId}
                        setTaskDeleteConfirmId={setTaskDeleteConfirmId}
                        listDeleteConfirmId={listDeleteConfirmId}
                        setListDeleteConfirmId={setListDeleteConfirmId}
                      />
                    </div>
                  </BoardDialogsProvider>
                </BoardTaskCompletionCelebrationProvider>
              </BoardKeyboardNavProvider>
            </BoardFilterResolutionProvider>
          </BoardTaskKeyboardBridgeProvider>
        </BoardLayoutProvider>
      </BoardStatsDisplayProvider>
    </ShortcutScopeProvider>
  );
}

function BoardViewDialogs({
  board,
  boardSearchOpen,
  closeSearch,
  taskDeleteConfirmId,
  setTaskDeleteConfirmId,
  listDeleteConfirmId,
  setListDeleteConfirmId,
}: {
  board: Board;
  boardSearchOpen: boolean;
  closeSearch: () => void;
  taskDeleteConfirmId: number | null;
  setTaskDeleteConfirmId: Dispatch<SetStateAction<number | null>>;
  listDeleteConfirmId: number | null;
  setListDeleteConfirmId: Dispatch<SetStateAction<number | null>>;
}) {
  const {
    shortcutHelpOpen,
    helpOpenReason,
    handleShortcutHelpClose,
    boardEditOpen,
    setBoardEditOpen,
    groupsEditorOpen,
    setGroupsEditorOpen,
    prioritiesEditorOpen,
    setPrioritiesEditorOpen,
    releasesEditorOpen,
    setReleasesEditorOpen,
  } = useBoardDialogs();

  const closeBoardEdit = useCallback(() => setBoardEditOpen(false), [setBoardEditOpen]);
  const closeGroupsEditor = useCallback(() => setGroupsEditorOpen(false), [setGroupsEditorOpen]);
  const closePrioritiesEditor = useCallback(
    () => setPrioritiesEditorOpen(false),
    [setPrioritiesEditorOpen],
  );
  const closeReleasesEditor = useCallback(() => setReleasesEditorOpen(false), [setReleasesEditorOpen]);
  const closeTaskDeleteConfirm = useCallback(
    () => setTaskDeleteConfirmId(null),
    [setTaskDeleteConfirmId],
  );
  const closeListDeleteConfirm = useCallback(
    () => setListDeleteConfirmId(null),
    [setListDeleteConfirmId],
  );

  return (
    <>
      <BoardSearchDialog
        board={board}
        open={boardSearchOpen}
        onClose={closeSearch}
      />

      <ShortcutHelpDialog
        open={shortcutHelpOpen}
        onClose={handleShortcutHelpClose}
        showOnboardingExtras={helpOpenReason === "auto"}
      />

      <BoardEditDialog
        board={board}
        open={boardEditOpen}
        onClose={closeBoardEdit}
      />

      <TaskGroupsEditorDialog
        board={board}
        open={groupsEditorOpen}
        onClose={closeGroupsEditor}
      />

      <TaskPrioritiesEditorDialog
        board={board}
        open={prioritiesEditorOpen}
        onClose={closePrioritiesEditor}
      />

      <ReleasesEditorDialog
        board={board}
        open={releasesEditorOpen}
        onClose={closeReleasesEditor}
      />

      <BoardTaskDeleteConfirm
        board={board}
        taskId={taskDeleteConfirmId}
        onClose={closeTaskDeleteConfirm}
      />

      <BoardListDeleteConfirm
        board={board}
        listId={listDeleteConfirmId}
        onClose={closeListDeleteConfirm}
      />
    </>
  );
}
