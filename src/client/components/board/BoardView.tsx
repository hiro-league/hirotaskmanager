import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Search,
  Terminal,
} from "lucide-react";
import {
  boardKeys,
  useBoard,
  useBoardStats,
  useStatuses,
  useStatusWorkflowOrder,
} from "@/api/queries";
import { useBoardChangeStream } from "@/api/useBoardChangeStream";
import { usePatchBoard, usePatchBoardViewPrefs } from "@/api/mutations";
import { resolvedBoardColor } from "../../../shared/boardColor";
import {
  ALL_TASK_GROUPS,
  groupDisplayLabelForId,
  priorityDisplayLabel,
  priorityLabelForId,
  resolvedBoardLayout,
  sortPrioritiesByValue,
  type Board,
} from "../../../shared/models";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import {
  usePreferencesStore,
  useResolvedActiveTaskGroup,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskDateFilter,
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
import { BoardTaskDateFilter } from "./BoardTaskDateFilter";
import { BoardEditDialog } from "./BoardEditDialog";
import { TaskGroupsEditorDialog } from "./TaskGroupsEditorDialog";
import { TaskPrioritiesEditorDialog } from "./TaskPrioritiesEditorDialog";
import {
  BoardKeyboardNavProvider,
  useBoardKeyboardNavOptional,
} from "./shortcuts/BoardKeyboardNavContext";
import { useUpdateTask } from "@/api/mutations";
import { BoardTaskKeyboardBridgeProvider } from "./shortcuts/BoardTaskKeyboardBridge";
import { BoardListDeleteConfirm } from "./shortcuts/BoardListDeleteConfirm";
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
import {
  rootCanConsumeVerticalWheel,
  verticalScrollChainContainsScrollable,
  verticalScrollChainCanConsumeWheel,
  verticalScrollChainCanConsumeWheelWithin,
} from "./boardSurfaceWheel";
import { useBoardCanvasPanScroll } from "./useBoardCanvasPanScroll";
import { getBoardThemeStyle } from "./boardTheme";
import { cn } from "@/lib/utils";
import { useBoardSearch } from "@/context/BoardSearchContext";
import type { BoardStatsFilter } from "../../../shared/boardStats";
import { BoardStatsChipsRow } from "./BoardStatsChips";
import {
  BoardStatsDisplayProvider,
  type BoardStatsDisplayValue,
} from "./BoardStatsContext";
import { BoardCelebrationSoundToggle } from "./BoardCelebrationSoundToggle";
import { BoardStatsVisibilityToggle } from "./BoardStatsVisibilityToggle";
import type { TaskDateFilterMode } from "./boardStatusUtils";
import { BoardSearchDialog } from "./BoardSearchDialog";
import { BoardNotificationDeepLink } from "./BoardNotificationDeepLink";
import { OPEN_SHORTCUT_HELP_EVENT } from "@/lib/shortcutHelpEvents";
import {
  BoardTaskCompletionCelebrationProvider,
  useBoardTaskCompletionCelebrationOptional,
} from "@/gamification";

interface BoardViewProps {
  boardId: string | null;
}

interface BoardScrollMetrics {
  hasOverflow: boolean;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

const HEADER_SCROLL_TRACK_WIDTH = 176;
const HEADER_SCROLL_MIN_THUMB_WIDTH = 40;
const EMPTY_BOARD_SCROLL_METRICS: BoardScrollMetrics = {
  hasOverflow: false,
  scrollLeft: 0,
  scrollWidth: 0,
  clientWidth: 0,
};

function formatYmdForBadge(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(dt.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" as const }
      : {}),
  });
}

function formatTaskDateFilterBadge(
  startDate: string,
  endDate: string,
  mode: TaskDateFilterMode,
): string {
  const range =
    startDate === endDate
      ? formatYmdForBadge(startDate)
      : `${formatYmdForBadge(startDate)}–${formatYmdForBadge(endDate)}`;
  const modeLabel =
    mode === "opened" ? "Opened" : mode === "closed" ? "Closed" : "Any";
  return `${range} · ${modeLabel}`;
}

function readBoardScrollMetrics(scroller: HTMLDivElement | null): BoardScrollMetrics {
  if (!scroller) return EMPTY_BOARD_SCROLL_METRICS;
  const clientWidth = scroller.clientWidth;
  const scrollWidth = scroller.scrollWidth;
  return {
    hasOverflow: scrollWidth - clientWidth > 1,
    scrollLeft: scroller.scrollLeft,
    scrollWidth,
    clientWidth,
  };
}

/** Lives inside BoardKeyboardNavProvider — merges board shortcuts with highlight navigation and task actions. */
function BoardShortcutBindings({
  board,
  openHelp,
  openBoardSearch,
  toggleFilters,
  setTaskDeleteConfirmId,
  setListDeleteConfirmId,
}: {
  board: Board;
  openHelp: () => void;
  openBoardSearch: () => void;
  toggleFilters: () => void;
  setTaskDeleteConfirmId: Dispatch<SetStateAction<number | null>>;
  setListDeleteConfirmId: Dispatch<SetStateAction<number | null>>;
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
  const completion = useBoardTaskCompletionCelebrationOptional();
  const queryClient = useQueryClient();
  const pendingPrioritySavesRef = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );
  const pendingPriorityTasksRef = useRef(new Map<number, Board["tasks"][number]>());
  const pendingGroupSavesRef = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );
  const pendingGroupTasksRef = useRef(new Map<number, Board["tasks"][number]>());
  const patchViewPrefs = usePatchBoardViewPrefs();

  useEffect(() => {
    return () => {
      for (const timeoutId of pendingPrioritySavesRef.current.values()) {
        clearTimeout(timeoutId);
      }
      for (const timeoutId of pendingGroupSavesRef.current.values()) {
        clearTimeout(timeoutId);
      }
      pendingPrioritySavesRef.current.clear();
      pendingPriorityTasksRef.current.clear();
      pendingGroupSavesRef.current.clear();
      pendingGroupTasksRef.current.clear();
    };
  }, []);

  const actions = useMemo<BoardShortcutActions>(
    () => ({
      openHelp,
      openBoardSearch,
      toggleFilters,
      cycleTaskCardViewMode: (b) =>
        cycleTaskCardViewModeForBoard(b, setTaskCardViewModeForBoard),
      toggleBoardLayout: (b) => {
        const current = resolvedBoardLayout(b);
        const next = current === "lanes" ? "stacked" : "lanes";
        // Same PATCH as BoardLayoutToggle — keeps server and React Query cache in sync.
        patchViewPrefs.mutate({ boardId: b.id, patch: { boardLayout: next } });
      },
      cycleTaskGroup: (b) =>
        cycleTaskGroupForBoard(b, setActiveTaskGroupForBoard),
      allTaskGroups: (b) =>
        setActiveTaskGroupForBoard(b.id, ALL_TASK_GROUPS),
      cycleTaskPriority: (b) =>
        cycleTaskPriorityForBoard(b, setActiveTaskPriorityIdsForBoard),
      cycleHighlightedTaskGroup: (b) => {
        const highlightedTaskId = nav?.highlightedTaskId;
        if (highlightedTaskId == null) return;
        const currentBoard =
          queryClient.getQueryData<Board>(boardKeys.detail(b.id)) ?? b;
        const task = currentBoard.tasks.find((entry) => entry.id === highlightedTaskId);
        if (!task || currentBoard.taskGroups.length === 0) return;
        const groupOrder = currentBoard.taskGroups.map((group) => group.id);
        const currentIndex = Math.max(0, groupOrder.indexOf(task.groupId));
        const nextGroupId = groupOrder[(currentIndex + 1) % groupOrder.length];
        if (nextGroupId == null || nextGroupId === task.groupId) return;
        const nextTask = {
          ...task,
          groupId: nextGroupId,
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueryData<Board>(boardKeys.detail(currentBoard.id), {
          ...currentBoard,
          tasks: currentBoard.tasks.map((entry) =>
            entry.id === nextTask.id ? nextTask : entry,
          ),
          updatedAt: nextTask.updatedAt,
        });
        pendingGroupTasksRef.current.set(nextTask.id, nextTask);
        const existingTimeout = pendingGroupSavesRef.current.get(nextTask.id);
        if (existingTimeout !== undefined) {
          clearTimeout(existingTimeout);
        }
        // Delay the PATCH so rapid G presses only persist the final group choice.
        const timeoutId = setTimeout(() => {
          const pendingTask = pendingGroupTasksRef.current.get(nextTask.id);
          pendingGroupTasksRef.current.delete(nextTask.id);
          pendingGroupSavesRef.current.delete(nextTask.id);
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
              groupId: pendingTask.groupId,
              updatedAt: pendingTask.updatedAt,
            },
          });
        }, 1000);
        pendingGroupSavesRef.current.set(nextTask.id, timeoutId);
      },
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
      editHighlightedTaskTitle: () => {
        const listId = nav?.highlightedListId;
        if (listId != null) {
          nav?.openRenameForList(listId);
          return;
        }
        const id = nav?.highlightedTaskId;
        if (id != null) bridge?.requestEditTaskTitle(id);
      },
      requestDeleteHighlight: () => {
        if (nav?.highlightedListId != null) {
          setListDeleteConfirmId(nav.highlightedListId);
          return;
        }
        const id = nav?.highlightedTaskId;
        if (id != null) setTaskDeleteConfirmId(id);
      },
      addTaskAtHighlight: () => {
        const listId =
          nav?.highlightedListId ??
          (nav?.highlightedTaskId != null
            ? board.tasks.find((t) => t.id === nav.highlightedTaskId)?.listId
            : null);
        if (listId == null) return;
        nav?.openAddTaskForList(listId);
      },
      addListAfterHighlight: (b) => {
        const anchorListId =
          nav?.highlightedListId ??
          (nav?.highlightedTaskId != null
            ? b.tasks.find((t) => t.id === nav.highlightedTaskId)?.listId
            : null);
        if (anchorListId == null) return;
        // Opens the same inline “Add list” composer as the dashed control; user types the name first.
        nav?.openAddListComposerAfter(anchorListId);
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
        completion?.celebrateTaskCompletion({ taskId: id });
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
      toggleBoardStats: (b) => {
        patchViewPrefs.mutate({
          boardId: b.id,
          patch: { showStats: !b.showStats },
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
      patchViewPrefs,
      setActiveTaskGroupForBoard,
      setActiveTaskPriorityIdsForBoard,
      nav,
      bridge,
      queryClient,
      setTaskDeleteConfirmId,
      setListDeleteConfirmId,
      statuses,
      workflowOrder,
      updateTask,
      board,
      completion,
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
  useBoardChangeStream(boardId, data?.id ?? null);
  const { open: boardSearchOpen, openSearch, closeSearch } = useBoardSearch();
  const patchBoard = usePatchBoard();
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const systemDark = useSystemDark();
  const dark = resolveDark(themePreference, systemDark);
  const stackedLayout = data ? resolvedBoardLayout(data) === "stacked" : false;

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

  const [boardEditOpen, setBoardEditOpen] = useState(false);
  const [groupsEditorOpen, setGroupsEditorOpen] = useState(false);
  const [prioritiesEditorOpen, setPrioritiesEditorOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const [headerHovered, setHeaderHovered] = useState(false);
  const [headerScrollDragging, setHeaderScrollDragging] = useState(false);
  const [boardScrollMetrics, setBoardScrollMetrics] = useState<BoardScrollMetrics>(
    EMPTY_BOARD_SCROLL_METRICS,
  );
  /** Whether the help dialog was opened automatically (on board open) vs via H. */
  const [helpOpenReason, setHelpOpenReason] = useState<
    "none" | "auto" | "manual"
  >("none");
  const [statsEntryToken, setStatsEntryToken] = useState(0);
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const boardNameBlurModeRef = useRef<"commit" | "cancel">("commit");
  const [boardEmojiFieldError, setBoardEmojiFieldError] = useState<
    string | null
  >(null);
  const headerScrollTrackRef = useRef<HTMLDivElement>(null);
  /** Top board strip (title, filters): wheel translates to horizontal canvas scroll. */
  const boardHeaderRef = useRef<HTMLDivElement>(null);
  const headerScrollDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startScrollLeft: number;
    maxScrollLeft: number;
    trackWidth: number;
    thumbWidth: number;
  } | null>(null);

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

  const syncBoardScrollMetrics = useCallback(() => {
    const next = readBoardScrollMetrics(scrollRef.current);
    setBoardScrollMetrics((prev) =>
      prev.hasOverflow === next.hasOverflow &&
      prev.scrollLeft === next.scrollLeft &&
      prev.scrollWidth === next.scrollWidth &&
      prev.clientWidth === next.clientWidth
        ? prev
        : next,
    );
  }, [scrollRef]);

  useEffect(() => {
    syncBoardScrollMetrics();
  });

  useEffect(() => {
    syncBoardScrollMetrics();
    const scroller = scrollRef.current;
    if (!scroller) return;
    const content = scroller.firstElementChild;
    const onScroll = () => syncBoardScrollMetrics();
    scroller.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => syncBoardScrollMetrics());
    resizeObserver?.observe(scroller);
    if (content instanceof Element) resizeObserver?.observe(content);

    window.addEventListener("resize", syncBoardScrollMetrics);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncBoardScrollMetrics);
    };
  }, [data?.id, scrollRef, syncBoardScrollMetrics, stackedLayout]);

  // Vertical wheel over list bodies keeps native scroll; elsewhere (gaps, list chrome,
  // status rail) translate wheel to horizontal board scroll. Board header uses the same
  // horizontal mapping (with a subtree-only vertical check so we do not hit app shell).
  // Stacked layout: when the board surface can still scroll vertically, keep that behavior
  // on the canvas; on the header we apply vertical scroll to the canvas manually.
  useEffect(() => {
    const scroller = scrollRef.current;
    const header = boardHeaderRef.current;
    if (!scroller) return;

    const applyHorizontal = (e: WheelEvent) => {
      const maxLeft = scroller.scrollWidth - scroller.clientWidth;
      if (maxLeft <= 1) return;
      e.preventDefault();
      scroller.scrollLeft += e.deltaY + e.deltaX;
      syncBoardScrollMetrics();
    };

    const onWheelBoard = (e: WheelEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      // Keep wheel gestures that start inside list/task scrollers local to that
      // scroller, even at the edge, so they do not suddenly pan the board sideways.
      if (verticalScrollChainContainsScrollable(t, scroller)) return;
      if (verticalScrollChainCanConsumeWheel(t, e.deltaY, scroller)) return;
      if (stackedLayout && rootCanConsumeVerticalWheel(scroller, e.deltaY)) return;
      applyHorizontal(e);
    };

    const onWheelHeader = (e: WheelEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || !header) return;
      if (verticalScrollChainCanConsumeWheelWithin(t, e.deltaY, header)) return;
      if (stackedLayout && rootCanConsumeVerticalWheel(scroller, e.deltaY)) {
        e.preventDefault();
        scroller.scrollTop += e.deltaY;
        syncBoardScrollMetrics();
        return;
      }
      applyHorizontal(e);
    };

    scroller.addEventListener("wheel", onWheelBoard, { passive: false });
    header?.addEventListener("wheel", onWheelHeader, { passive: false });
    return () => {
      scroller.removeEventListener("wheel", onWheelBoard);
      header?.removeEventListener("wheel", onWheelHeader);
    };
  }, [scrollRef, stackedLayout, syncBoardScrollMetrics]);

  const startHeaderScrollDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const scroller = scrollRef.current;
      const track = headerScrollTrackRef.current;
      if (!scroller || !track) return;

      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      if (maxScrollLeft <= 0) return;

      const trackWidth = track.clientWidth;
      const thumbWidth = Math.max(
        HEADER_SCROLL_MIN_THUMB_WIDTH,
        (trackWidth * scroller.clientWidth) / scroller.scrollWidth,
      );
      const travel = Math.max(1, trackWidth - thumbWidth);
      const clickedThumb = (e.target as Element).closest("[data-board-scroll-thumb]");

      if (!clickedThumb) {
        const rect = track.getBoundingClientRect();
        const pointerX = e.clientX - rect.left;
        const nextThumbOffset = Math.min(
          Math.max(pointerX - thumbWidth / 2, 0),
          travel,
        );
        scroller.scrollLeft = (nextThumbOffset / travel) * maxScrollLeft;
        syncBoardScrollMetrics();
      }

      headerScrollDragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startScrollLeft: scroller.scrollLeft,
        maxScrollLeft,
        trackWidth,
        thumbWidth,
      };
      setHeaderScrollDragging(true);
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        /* already captured or unsupported */
      }
      e.preventDefault();
    },
    [scrollRef, syncBoardScrollMetrics],
  );

  const moveHeaderScrollDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = headerScrollDragRef.current;
      const scroller = scrollRef.current;
      if (!drag || !scroller || e.pointerId !== drag.pointerId) return;

      const travel = Math.max(1, drag.trackWidth - drag.thumbWidth);
      const startThumbOffset = (drag.startScrollLeft / drag.maxScrollLeft) * travel;
      const nextThumbOffset = Math.min(
        Math.max(startThumbOffset + (e.clientX - drag.startClientX), 0),
        travel,
      );
      scroller.scrollLeft = (nextThumbOffset / travel) * drag.maxScrollLeft;
      syncBoardScrollMetrics();
      e.preventDefault();
    },
    [scrollRef, syncBoardScrollMetrics],
  );

  const endHeaderScrollDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = headerScrollDragRef.current;
      const track = headerScrollTrackRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      try {
        track?.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      headerScrollDragRef.current = null;
      setHeaderScrollDragging(false);
      syncBoardScrollMetrics();
    },
    [syncBoardScrollMetrics],
  );

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
  const [listDeleteConfirmId, setListDeleteConfirmId] = useState<number | null>(
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
  const dateFilterResolved = useResolvedTaskDateFilter(
    data?.id ?? boardId ?? "",
  );
  const prevStatsVisibleRef = useRef<boolean | null>(null);

  useEffect(() => {
    const visible = Boolean(data?.showStats);
    if (prevStatsVisibleRef.current === null) {
      prevStatsVisibleRef.current = visible;
      return;
    }
    // Run entry motion when stats are revealed, even if cached numbers skip the spinner.
    if (visible && !prevStatsVisibleRef.current) {
      setStatsEntryToken((n) => n + 1);
    }
    prevStatsVisibleRef.current = visible;
  }, [data?.showStats]);

  // Stats scope uses group / priority / date only — not status visibility (T/O/C already split by open vs closed).
  const statsFilter = useMemo((): BoardStatsFilter | null => {
    if (!data) return null;
    return {
      activeGroupId: activeTaskGroup,
      activePriorityIds: activeTaskPriorityIds,
      dateFilter: dateFilterResolved,
    };
  }, [data, activeTaskGroup, activeTaskPriorityIds, dateFilterResolved]);

  const boardStatsQuery = useBoardStats(data?.id ?? null, statsFilter, {
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
    const q = boardStatsQuery;
    const statsError = q.isError;
    return {
      board: statsError ? null : (q.data?.board ?? null),
      listStat: (listId: number) =>
        statsError
          ? { total: 0, open: 0, closed: 0 }
          : (q.data?.lists.find((l) => l.listId === listId)?.stats ?? {
              total: 0,
              open: 0,
              closed: 0,
            }),
      entryToken: statsEntryToken,
      fetching: q.isFetching,
      pending: q.isPending,
      showChipSpinner:
        q.isPending || (q.isFetching && q.isPlaceholderData),
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
        boardId: data.id,
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
          boardId: data.id,
          emoji: next,
        });
      } catch {
        /* server rejected; cache rolls back via mutation onError */
      }
    },
    [data, patchBoard],
  );

  // Compute this without a hook so BoardView keeps the same hook order while it
  // moves between empty/loading/error/success states.
  const boardThemeStyle: CSSProperties = {
    ...getBoardThemeStyle(resolvedBoardColor(data ?? {}), dark),
    background: "var(--board-canvas-image)",
  };
  const boardSurfaceId = data ? `board-surface-${data.id}` : null;

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
  const activeGroupLabel =
    activeTaskGroup !== ALL_TASK_GROUPS
      ? groupDisplayLabelForId(data.taskGroups, Number(activeTaskGroup))
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
  const activeDateSummary = dateFilterResolved
    ? formatTaskDateFilterBadge(
        dateFilterResolved.startDate,
        dateFilterResolved.endDate,
        dateFilterResolved.mode,
      )
    : null;
  const headerScrollVisible =
    boardScrollMetrics.hasOverflow && (headerHovered || headerScrollDragging);
  const headerScrollMaxLeft = Math.max(
    0,
    boardScrollMetrics.scrollWidth - boardScrollMetrics.clientWidth,
  );
  const headerScrollThumbWidth = boardScrollMetrics.hasOverflow
    ? Math.max(
        HEADER_SCROLL_MIN_THUMB_WIDTH,
        (HEADER_SCROLL_TRACK_WIDTH * boardScrollMetrics.clientWidth) /
          boardScrollMetrics.scrollWidth,
      )
    : HEADER_SCROLL_TRACK_WIDTH;
  const headerScrollThumbTravel = Math.max(
    0,
    HEADER_SCROLL_TRACK_WIDTH - headerScrollThumbWidth,
  );
  const headerScrollThumbOffset =
    headerScrollMaxLeft > 0
      ? (boardScrollMetrics.scrollLeft / headerScrollMaxLeft) *
        headerScrollThumbTravel
      : 0;

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
        board={data}
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
      <div
        ref={boardHeaderRef}
        className="relative shrink-0 border-b"
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
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
            <div className="relative flex min-w-0 items-center gap-2">
              {boardEmojiFieldError ? (
                <p className="absolute left-0 top-full z-20 mt-0.5 max-w-[min(100%,12rem)] text-[10px] text-destructive">
                  {boardEmojiFieldError}
                </p>
              ) : null}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-foreground hover:bg-muted"
                    title="Board menu"
                    aria-label="Board menu"
                  >
                    <MoreHorizontal className="size-4 shrink-0" aria-hidden />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-[100] min-w-[12rem] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
                    sideOffset={4}
                    align="start"
                  >
                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground"
                      onSelect={() => setBoardEditOpen(true)}
                    >
                      Edit board…
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground"
                      onSelect={() => setGroupsEditorOpen(true)}
                    >
                      Task groups
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground"
                      onSelect={() => setPrioritiesEditorOpen(true)}
                    >
                      Task priorities
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              {!data.cliPolicy.readBoard ? (
                <span
                  className="inline-flex shrink-0 text-muted-foreground"
                  title="CLI read off — hirotm cannot open this board until enabled in Edit board"
                  aria-label="CLI read disabled for this board"
                >
                  <Terminal className="size-4" strokeWidth={2} aria-hidden />
                </span>
              ) : null}
              <EmojiPickerMenuButton
                emoji={data.emoji}
                disabled={patchBoard.isPending}
                compact
                placeholderIcon={
                  <span
                    className="text-[0.9375rem] font-medium leading-none text-muted-foreground"
                    aria-hidden
                  >
                    ?
                  </span>
                }
                onValidationError={setBoardEmojiFieldError}
                chooseAriaLabel="Choose board emoji"
                selectedAriaLabel={(e) => `Change board emoji (${e})`}
                onPick={pickBoardEmoji}
              />
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
                  disabled={patchBoard.isPending}
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
                  {/* Name only — board emoji is the separate control to the left. */}
                  {data.name.trim() || "Untitled"}
                </button>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-foreground hover:bg-muted"
                  title="Search tasks (K or F3)"
                  aria-label="Search tasks on this board"
                  onClick={() => openSearch()}
                >
                  <Search className="size-4 shrink-0" aria-hidden />
                </button>
                <BoardCelebrationSoundToggle board={data} />
              </div>
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
              {activeDateSummary ? (
                <div className="hidden min-w-0 max-w-[14rem] items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground sm:inline-flex">
                  <span className="uppercase tracking-wide">Dates</span>
                  <span
                    className="truncate font-medium text-foreground"
                    title={activeDateSummary}
                  >
                    {activeDateSummary}
                  </span>
                </div>
              ) : null}
              {data.showStats ? (
                boardStatsDisplay.statsError ? (
                  <span
                    className="inline-flex items-center text-xs text-destructive"
                    role="alert"
                  >
                    Stats unavailable
                  </span>
                ) : (
                  <BoardStatsChipsRow
                    listCount={data.lists.length}
                    stats={
                      boardStatsQuery.data?.board ?? {
                        total: 0,
                        open: 0,
                        closed: 0,
                      }
                    }
                    showSpinner={boardStatsDisplay.showChipSpinner}
                    entryToken={boardStatsDisplay.entryToken}
                  />
                )
              ) : null}
            </div>
            {!filterCollapsed ? (
              <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 justify-self-center">
                {/* Keep horizontal scrolling next to board-level appearance controls, not at the far edge of the header. */}
                <div
                  ref={headerScrollTrackRef}
                  role="scrollbar"
                  aria-controls={boardSurfaceId ?? undefined}
                  aria-orientation="horizontal"
                  aria-valuemin={0}
                  aria-valuemax={headerScrollMaxLeft}
                  aria-valuenow={Math.round(boardScrollMetrics.scrollLeft)}
                  aria-label="Scroll board lists"
                  data-board-no-pan
                  className={cn(
                    "relative h-8 rounded-full border border-border/70 bg-muted/35 transition-opacity",
                    headerScrollVisible
                      ? "pointer-events-auto opacity-100"
                      : "pointer-events-none opacity-0",
                  )}
                  style={{ width: `${HEADER_SCROLL_TRACK_WIDTH}px` }}
                  onPointerDown={startHeaderScrollDrag}
                  onPointerMove={moveHeaderScrollDrag}
                  onPointerUp={endHeaderScrollDrag}
                  onPointerCancel={endHeaderScrollDrag}
                  onLostPointerCapture={() => {
                    headerScrollDragRef.current = null;
                    setHeaderScrollDragging(false);
                  }}
                >
                  <div className="pointer-events-none absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border/70" />
                  <div
                    data-board-scroll-thumb
                    className={cn(
                      "absolute top-1/2 h-5 -translate-y-1/2 rounded-full border border-border bg-background/95 shadow-sm",
                      headerScrollDragging && "cursor-grabbing",
                    )}
                    style={{
                      left: `${headerScrollThumbOffset}px`,
                      width: `${headerScrollThumbWidth}px`,
                    }}
                  />
                </div>
                <BoardColorMenu board={data} compact swatchOnly />
                <BoardLayoutToggle board={data} iconsOnly />
                <BoardTaskCardSizeToggle board={data} />
                <BoardStatsVisibilityToggle board={data} />
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
              className="pointer-events-auto pt-1"
              data-board-no-pan
            >
              {/* 2×2 grid: row1 = priority + status, row2 = groups + reserved cell. */}
              <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3">
                <div className="min-w-0">
                  <BoardPriorityToggles board={data} />
                </div>
                <div className="min-w-0">
                  <BoardStatusToggles board={data} />
                </div>
                <div className="min-w-0">
                  <TaskGroupSwitcher board={data} />
                </div>
                <div className="min-w-0">
                  <BoardTaskDateFilter board={data} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Prevent native selection on the board surface so drag gestures do not highlight task text. */}
      <div
        id={boardSurfaceId ?? undefined}
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
