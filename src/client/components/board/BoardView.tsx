import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Navigate } from "react-router-dom";
import { useBoard, useBoardStats } from "@/api/queries";
import { useBoardChangeStream } from "@/api/useBoardChangeStream";
import { usePatchBoard } from "@/api/mutations";
import { resolveDark, useSystemDark } from "@/components/layout/ThemeRoot";
import { useBoardSearch } from "@/context/BoardSearchContext";
import { OPEN_SHORTCUT_HELP_EVENT } from "@/lib/shortcutHelpEvents";
import {
  usePreferencesStore,
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import { resolvedBoardColor } from "../../../shared/boardColor";
import type { BoardStatsFilter } from "../../../shared/boardStats";
import { resolvedBoardLayout } from "../../../shared/models";
import { BoardCanvas } from "./BoardCanvas";
import { BoardColumns } from "./columns/BoardColumns";
import { BoardColumnsStacked } from "./columns/BoardColumnsStacked";
import { BoardEditDialog } from "./dialogs/BoardEditDialog";
import { BoardHeader } from "./header/BoardHeader";
import { BoardNotificationDeepLink } from "./BoardNotificationDeepLink";
import { BoardSearchDialog } from "./dialogs/BoardSearchDialog";
import {
  BoardStatsDisplayProvider,
  type BoardStatsDisplayValue,
} from "./BoardStatsContext";
import { BoardShortcutBindings } from "./BoardShortcutBindings";
import { buildBoardFilterSummaries } from "./boardFilterSummaries";
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

/** Board GET returns 404 JSON when the board is gone or in Trash; send users to the Trash page instead of a raw error. */
function isBoardDetailNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("not found");
}

interface BoardViewProps {
  boardId: string | null;
}

export function BoardView({ boardId }: BoardViewProps) {
  const { data, isLoading, isError, error, isFetching } = useBoard(boardId);
  useBoardChangeStream(boardId, data?.boardId ?? null);
  const { open: boardSearchOpen, openSearch, closeSearch } = useBoardSearch();
  const patchBoard = usePatchBoard();
  const themePreference = usePreferencesStore((state) => state.themePreference);
  const systemDark = useSystemDark();
  const dark = resolveDark(themePreference, systemDark);
  const stackedLayout = data ? resolvedBoardLayout(data) === "stacked" : false;

  const filterCollapsed = usePreferencesStore(
    (state) => state.boardFilterStripCollapsed,
  );
  const toggleFilterStrip = usePreferencesStore(
    (state) => state.toggleBoardFilterStripCollapsed,
  );
  const boardShortcutHelpDismissed = usePreferencesStore(
    (state) => state.boardShortcutHelpDismissed,
  );
  const setBoardShortcutHelpDismissed = usePreferencesStore(
    (state) => state.setBoardShortcutHelpDismissed,
  );

  const [boardEditOpen, setBoardEditOpen] = useState(false);
  const [groupsEditorOpen, setGroupsEditorOpen] = useState(false);
  const [prioritiesEditorOpen, setPrioritiesEditorOpen] = useState(false);
  const [releasesEditorOpen, setReleasesEditorOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  /** Whether the help dialog was opened automatically (on board open) vs via H. */
  const [helpOpenReason, setHelpOpenReason] = useState<
    "none" | "auto" | "manual"
  >("none");
  const [statsEntryToken, setStatsEntryToken] = useState(0);
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const boardNameBlurModeRef = useRef<"commit" | "cancel">("commit");
  const [boardEmojiFieldError, setBoardEmojiFieldError] = useState<string | null>(
    null,
  );
  const boardHeaderRef = useRef<HTMLDivElement>(null);

  const openHelp = useCallback(() => {
    setHelpOpenReason("manual");
    setShortcutHelpOpen(true);
  }, []);

  useEffect(() => {
    const onOpenFromHeader = () => {
      setHelpOpenReason("manual");
      setShortcutHelpOpen(true);
    };
    window.addEventListener(OPEN_SHORTCUT_HELP_EVENT, onOpenFromHeader);
    return () => window.removeEventListener(OPEN_SHORTCUT_HELP_EVENT, onOpenFromHeader);
  }, []);

  const { scrollRef, panning, boardCanvasPanHandlers } =
    useBoardCanvasPanScroll();
  const headerScroll = useBoardHeaderScrollMetrics({
    boardId: data?.boardId ?? null,
    stackedLayout,
    scrollRef,
    headerRef: boardHeaderRef,
  });

  useEffect(() => {
    closeSearch();
  }, [boardId, closeSearch]);

  useEffect(() => {
    if (!data || !boardId) return;
    if (boardShortcutHelpDismissed) return;
    setHelpOpenReason("auto");
    setShortcutHelpOpen(true);
  }, [boardId, data?.boardId, boardShortcutHelpDismissed]);

  useEffect(() => {
    setEditingBoardName(false);
    setBoardNameDraft(data?.name ?? "");
  }, [data?.boardId]);

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
  const [listDeleteConfirmId, setListDeleteConfirmId] = useState<number | null>(
    null,
  );
  const activeTaskGroupIds = useResolvedActiveTaskGroupIds(
    data?.boardId ?? boardId ?? "",
    data?.taskGroups ?? [],
  );
  const activeTaskPriorityIds = useResolvedActiveTaskPriorityIds(
    data?.boardId ?? boardId ?? "",
    data?.taskPriorities ?? [],
  );
  const activeReleaseIds = useResolvedActiveReleaseIds(
    data?.boardId ?? boardId ?? "",
    data?.releases ?? [],
  );
  const dateFilterResolved = useResolvedTaskDateFilter(
    data?.boardId ?? boardId ?? "",
  );
  const prevStatsVisibleRef = useRef<boolean | null>(null);

  useEffect(() => {
    const visible = Boolean(data?.showStats);
    if (prevStatsVisibleRef.current === null) {
      prevStatsVisibleRef.current = visible;
      return;
    }
    if (visible && !prevStatsVisibleRef.current) {
      setStatsEntryToken((value) => value + 1);
    }
    prevStatsVisibleRef.current = visible;
  }, [data?.showStats]);

  const statsFilter = useMemo((): BoardStatsFilter | null => {
    if (!data) return null;
    return {
      activeGroupIds: activeTaskGroupIds,
      activePriorityIds: activeTaskPriorityIds,
      activeReleaseIds,
      dateFilter: dateFilterResolved,
    };
  }, [
    data,
    activeTaskGroupIds,
    activeTaskPriorityIds,
    activeReleaseIds,
    dateFilterResolved,
  ]);

  const boardStatsQuery = useBoardStats(data?.boardId ?? null, statsFilter, {
    enabled: Boolean(data?.showStats),
  });

  const boardStatsDisplay = useMemo((): BoardStatsDisplayValue => {
    if (!data?.showStats) {
      const empty = { total: 0, open: 0, closed: 0 };
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
    return {
      board: statsError ? null : (query.data?.board ?? null),
      listStat: (listId: number) =>
        statsError
          ? { total: 0, open: 0, closed: 0 }
          : (query.data?.lists.find((entry) => entry.listId === listId)?.stats ?? {
              total: 0,
              open: 0,
              closed: 0,
            }),
      entryToken: statsEntryToken,
      fetching: query.isFetching,
      pending: query.isPending,
      showChipSpinner:
        query.isPending || (query.isFetching && query.isPlaceholderData),
      statsError,
    };
  }, [data?.showStats, boardStatsQuery, statsEntryToken]);

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
      await patchBoard.mutateAsync({
        boardId: data.boardId,
        name: trimmed,
      });
    } catch {
      setBoardNameDraft(data.name);
    }
  }, [boardNameDraft, data, patchBoard]);

  const pickBoardEmoji = useCallback(
    async (next: string | null) => {
      if (!data) return;
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

  const boardThemeStyle: CSSProperties = {
    ...getBoardThemeStyle(resolvedBoardColor(data ?? {}), dark),
    background: "var(--board-canvas-image)",
  };
  const boardSurfaceId = data ? `board-surface-${data.boardId}` : null;
  const boardStats = boardStatsQuery.data?.board ?? {
    total: 0,
    open: 0,
    closed: 0,
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
    if (boardId && isError && isBoardDetailNotFound(error)) {
      return <Navigate to="/trash" replace />;
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Could not load this board."}
        </p>
      </div>
    );
  }

  const filterSummaries = buildBoardFilterSummaries(
    data,
    activeTaskGroupIds,
    activeTaskPriorityIds,
    activeReleaseIds,
    dateFilterResolved,
  );

  return (
    <ShortcutScopeProvider>
      <BoardStatsDisplayProvider value={boardStatsDisplay}>
        <BoardTaskKeyboardBridgeProvider>
          <BoardKeyboardNavProvider
            board={data}
            layout={stackedLayout ? "stacked" : "lanes"}
          >
            <BoardTaskCompletionCelebrationProvider
              celebrationSoundsMuted={data.muteCelebrationSounds}
            >
              <BoardShortcutBindings
                boardId={data.boardId}
                boardLayout={data.boardLayout}
                defaultReleaseId={data.defaultReleaseId}
                releases={data.releases}
                showStats={data.showStats}
                taskGroups={data.taskGroups}
                taskPriorities={data.taskPriorities}
                tasks={data.tasks}
                openHelp={openHelp}
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
                <BoardHeader
                  board={data}
                  boardSurfaceId={boardSurfaceId}
                  filterCollapsed={filterCollapsed}
                  boardEmojiFieldError={boardEmojiFieldError}
                  onBoardEmojiValidationError={setBoardEmojiFieldError}
                  patchBoardPending={patchBoard.isPending}
                  pickBoardEmoji={pickBoardEmoji}
                  editingBoardName={editingBoardName}
                  setEditingBoardName={setEditingBoardName}
                  boardNameDraft={boardNameDraft}
                  setBoardNameDraft={setBoardNameDraft}
                  boardNameInputRef={boardNameInputRef}
                  boardNameBlurModeRef={boardNameBlurModeRef}
                  commitBoardRename={commitBoardRename}
                  cancelBoardRename={cancelBoardRename}
                  boardHeaderRef={boardHeaderRef}
                  headerScroll={headerScroll}
                  boardStatsDisplay={boardStatsDisplay}
                  boardStats={boardStats}
                  filterSummaries={filterSummaries}
                  toggleFilterStrip={toggleFilterStrip}
                  onOpenBoardEdit={() => setBoardEditOpen(true)}
                  onOpenGroupsEditor={() => setGroupsEditorOpen(true)}
                  onOpenPrioritiesEditor={() => setPrioritiesEditorOpen(true)}
                  onOpenReleasesEditor={() => setReleasesEditorOpen(true)}
                />

                <BoardCanvas
                  boardSurfaceId={boardSurfaceId}
                  scrollRef={scrollRef}
                  stackedLayout={stackedLayout}
                  panning={panning}
                  boardCanvasPanHandlers={boardCanvasPanHandlers}
                >
                  {stackedLayout ? (
                    <BoardColumnsStacked board={data} />
                  ) : (
                    <BoardColumns board={data} />
                  )}
                </BoardCanvas>

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

                <BoardEditDialog
                  board={data}
                  open={boardEditOpen}
                  onClose={() => setBoardEditOpen(false)}
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

                <ReleasesEditorDialog
                  board={data}
                  open={releasesEditorOpen}
                  onClose={() => setReleasesEditorOpen(false)}
                />

                <BoardTaskDeleteConfirm
                  board={data}
                  taskId={taskDeleteConfirmId}
                  onClose={() => setTaskDeleteConfirmId(null)}
                />

                <BoardListDeleteConfirm
                  board={data}
                  listId={listDeleteConfirmId}
                  onClose={() => setListDeleteConfirmId(null)}
                />
              </div>
            </BoardTaskCompletionCelebrationProvider>
          </BoardKeyboardNavProvider>
        </BoardTaskKeyboardBridgeProvider>
      </BoardStatsDisplayProvider>
    </ShortcutScopeProvider>
  );
}
