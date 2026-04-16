import type { QueryClient } from "@tanstack/react-query";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { boardKeys } from "@/api/queries";
import {
  ALL_TASK_GROUPS,
  sortPrioritiesByValue,
  sortTaskGroupsForDisplay,
  type Board,
  type Status,
} from "../../../../shared/models";
import {
  getNextTaskCardViewMode,
  useBoardFiltersStore,
  type TaskCardViewMode,
} from "@/store/preferences";
import type {
  BoardShortcutActions,
  BoardShortcutBoard,
} from "./boardShortcutTypes";

type BoardTask = Board["tasks"][number];
type PendingSaveTimeoutsRef = MutableRefObject<Map<number, ReturnType<typeof setTimeout>>>;
type PendingTasksRef = MutableRefObject<Map<number, BoardTask>>;
type PersistTaskUpdate = (boardId: number, task: BoardTask) => void;

function replaceBoardTaskInCache(
  queryClient: QueryClient,
  currentBoard: Board,
  nextTask: BoardTask,
): void {
  queryClient.setQueryData<Board>(boardKeys.detail(currentBoard.boardId), {
    ...currentBoard,
    tasks: currentBoard.tasks.map((entry) =>
      entry.taskId === nextTask.taskId ? nextTask : entry,
    ),
    updatedAt: nextTask.updatedAt,
  });
}

function scheduleDebouncedTaskPersist(
  queryClient: QueryClient,
  currentBoard: Board,
  nextTask: BoardTask,
  pendingSavesRef: PendingSaveTimeoutsRef,
  pendingTasksRef: PendingTasksRef,
  persistTaskUpdate: PersistTaskUpdate,
  mergePendingTask: (latestTask: BoardTask, pendingTask: BoardTask) => BoardTask,
): void {
  pendingTasksRef.current.set(nextTask.taskId, nextTask);
  const existingTimeout = pendingSavesRef.current.get(nextTask.taskId);
  if (existingTimeout !== undefined) {
    clearTimeout(existingTimeout);
  }
  const timeoutId = setTimeout(() => {
    const pendingTask = pendingTasksRef.current.get(nextTask.taskId);
    pendingTasksRef.current.delete(nextTask.taskId);
    pendingSavesRef.current.delete(nextTask.taskId);
    if (!pendingTask) return;
    const latestBoard =
      queryClient.getQueryData<Board>(boardKeys.detail(currentBoard.boardId)) ??
      currentBoard;
    const latestTask =
      latestBoard.tasks.find((entry) => entry.taskId === pendingTask.taskId) ??
      pendingTask;
    persistTaskUpdate(
      latestBoard.boardId,
      mergePendingTask(latestTask, pendingTask),
    );
  }, 1000);
  pendingSavesRef.current.set(nextTask.taskId, timeoutId);
}

export function cycleTaskGroupForBoard(
  board: BoardShortcutBoard,
  setActive: (
    boardId: string | number,
    groupIds: string[] | undefined,
  ) => void,
): void {
  if (board.taskGroups.length === 0) return;
  const groupsOrdered = sortTaskGroupsForDisplay(board.taskGroups);
  const orderedIds = groupsOrdered.map((group) => String(group.groupId));
  const raw =
    useBoardFiltersStore.getState().activeTaskGroupIdsByBoardId[String(board.boardId)];
  const resolved =
    Array.isArray(raw) && raw.length === 1 && orderedIds.includes(raw[0]!)
      ? raw[0]!
      : ALL_TASK_GROUPS;
  const order = [ALL_TASK_GROUPS, ...orderedIds];
  const idx = Math.max(0, order.indexOf(resolved));
  const next = order[(idx + 1) % order.length] ?? ALL_TASK_GROUPS;
  if (next === ALL_TASK_GROUPS) {
    setActive(board.boardId, undefined);
    return;
  }
  setActive(board.boardId, [next]);
}

export function cycleTaskCardViewModeForBoard(
  board: BoardShortcutBoard,
  setViewMode: (boardId: string | number, mode: "small" | "normal" | "large" | "larger") => void,
): void {
  const current =
    useBoardFiltersStore.getState().taskCardViewModeByBoardId[String(board.boardId)] ?? "normal";
  setViewMode(board.boardId, getNextTaskCardViewMode(current));
}

export function cycleTaskPriorityForBoard(
  board: BoardShortcutBoard,
  setActive: (
    boardId: string | number,
    priorityIds: string[] | undefined,
  ) => void,
): void {
  const orderedIds = sortPrioritiesByValue(board.taskPriorities).map((priority) =>
    String(priority.priorityId),
  );
  if (orderedIds.length === 0) return;
  const raw =
    useBoardFiltersStore.getState().activeTaskPriorityIdsByBoardId[
      String(board.boardId)
    ];
  if (raw === undefined) {
    setActive(board.boardId, [orderedIds[0]!]);
    return;
  }
  if (raw.length !== 1 || !orderedIds.includes(raw[0]!)) {
    setActive(board.boardId, undefined);
    return;
  }
  const resolved = raw[0]!;
  const idx = orderedIds.indexOf(resolved);
  if (idx < 0 || idx >= orderedIds.length - 1) {
    setActive(board.boardId, undefined);
    return;
  }
  setActive(board.boardId, [orderedIds[idx + 1]!]);
}

export function cycleHighlightedTaskGroupForBoard(
  board: BoardShortcutBoard,
  highlightedTaskId: number | null | undefined,
  queryClient: QueryClient,
  pendingSavesRef: PendingSaveTimeoutsRef,
  pendingTasksRef: PendingTasksRef,
  persistTaskUpdate: PersistTaskUpdate,
): void {
  if (highlightedTaskId == null) return;
  const currentBoard = queryClient.getQueryData<Board>(boardKeys.detail(board.boardId));
  if (!currentBoard) return;
  const task = currentBoard.tasks.find((entry) => entry.taskId === highlightedTaskId);
  if (!task || currentBoard.taskGroups.length === 0) return;
  const groupOrder = sortTaskGroupsForDisplay(currentBoard.taskGroups).map(
    (group) => group.groupId,
  );
  const currentIndex = Math.max(0, groupOrder.indexOf(task.groupId));
  const nextGroupId = groupOrder[(currentIndex + 1) % groupOrder.length];
  if (nextGroupId == null || nextGroupId === task.groupId) return;
  const nextTask = {
    ...task,
    groupId: nextGroupId,
    updatedAt: new Date().toISOString(),
  };
  replaceBoardTaskInCache(queryClient, currentBoard, nextTask);
  scheduleDebouncedTaskPersist(
    queryClient,
    currentBoard,
    nextTask,
    pendingSavesRef,
    pendingTasksRef,
    persistTaskUpdate,
    (latestTask, pendingTask) => ({
      ...latestTask,
      groupId: pendingTask.groupId,
      updatedAt: pendingTask.updatedAt,
    }),
  );
}

export function cycleHighlightedTaskPriorityForBoard(
  board: BoardShortcutBoard,
  highlightedTaskId: number | null | undefined,
  queryClient: QueryClient,
  pendingSavesRef: PendingSaveTimeoutsRef,
  pendingTasksRef: PendingTasksRef,
  persistTaskUpdate: PersistTaskUpdate,
): void {
  if (highlightedTaskId == null) return;
  const currentBoard = queryClient.getQueryData<Board>(boardKeys.detail(board.boardId));
  if (!currentBoard) return;
  const task = currentBoard.tasks.find((entry) => entry.taskId === highlightedTaskId);
  if (!task) return;
  const priorityOrder = sortPrioritiesByValue(currentBoard.taskPriorities).map(
    (priority) => priority.priorityId,
  );
  const found = priorityOrder.findIndex(
    (priorityId) => priorityId === task.priorityId,
  );
  const currentIndex = found === -1 ? 0 : found;
  const nextPriorityId = priorityOrder[(currentIndex + 1) % priorityOrder.length];
  if (nextPriorityId == null) return;
  const nextTask = {
    ...task,
    priorityId: nextPriorityId,
    updatedAt: new Date().toISOString(),
  };
  replaceBoardTaskInCache(queryClient, currentBoard, nextTask);
  scheduleDebouncedTaskPersist(
    queryClient,
    currentBoard,
    nextTask,
    pendingSavesRef,
    pendingTasksRef,
    persistTaskUpdate,
    (latestTask, pendingTask) => ({
      ...latestTask,
      priorityId: pendingTask.priorityId,
      updatedAt: pendingTask.updatedAt,
    }),
  );
}

export function completeHighlightedTaskForBoard(
  board: BoardShortcutBoard,
  highlightedTaskId: number | null | undefined,
  statuses: readonly Status[] | undefined,
  persistTaskUpdate: PersistTaskUpdate,
  celebrateTaskCompletion?: (taskId: number) => void,
): void {
  if (highlightedTaskId == null) return;
  const task = board.tasks.find((entry) => entry.taskId === highlightedTaskId);
  if (!task) return;
  const meta = statuses?.find((status) => status.statusId === task.status);
  if (meta?.isClosed) return;
  const closedId = statuses?.find((status) => status.isClosed)?.statusId ?? "closed";
  const now = new Date().toISOString();
  celebrateTaskCompletion?.(highlightedTaskId);
  persistTaskUpdate(board.boardId, {
    ...task,
    status: closedId,
    updatedAt: now,
    closedAt: task.closedAt ?? now,
  });
}

export function reopenHighlightedTaskForBoard(
  board: BoardShortcutBoard,
  highlightedTaskId: number | null | undefined,
  statuses: readonly Status[] | undefined,
  workflowOrder: readonly string[],
  persistTaskUpdate: PersistTaskUpdate,
): void {
  if (highlightedTaskId == null) return;
  const task = board.tasks.find((entry) => entry.taskId === highlightedTaskId);
  if (!task) return;
  const meta = statuses?.find((status) => status.statusId === task.status);
  if (!meta?.isClosed) return;
  const openId =
    workflowOrder.find((statusId) => statusId === "open") ??
    workflowOrder[0] ??
    "open";
  const now = new Date().toISOString();
  persistTaskUpdate(board.boardId, {
    ...task,
    status: openId,
    updatedAt: now,
    closedAt: null,
  });
}

export function assignDefaultReleaseToHighlightedTaskForBoard(
  board: BoardShortcutBoard,
  highlightedTaskId: number | null | undefined,
  persistTaskUpdate: PersistTaskUpdate,
): void {
  const defaultRelease = board.defaultReleaseId;
  if (defaultRelease == null || highlightedTaskId == null) return;
  const task = board.tasks.find((entry) => entry.taskId === highlightedTaskId);
  if (!task) return;
  if (!board.releases.some((release) => release.releaseId === defaultRelease)) {
    return;
  }
  persistTaskUpdate(board.boardId, {
    ...task,
    releaseId: defaultRelease,
    updatedAt: new Date().toISOString(),
  });
}

interface NavDeps {
  readonly highlightedTaskId: number | null;
  readonly highlightedListId: number | null;
  focusOrScrollHighlight: () => void;
  moveHighlight: (direction: "up" | "down" | "left" | "right") => void;
  highlightHome: () => void;
  highlightEnd: () => void;
  highlightPage: (direction: -1 | 1) => void;
  openRenameForList: (listId: number) => void;
  openAddTaskForList: (listId: number) => void;
  openAddListComposerAfter: (anchorListId: number) => void;
}

interface BridgeDeps {
  requestOpenTaskEditor: (taskId: number) => void;
  requestEditTaskTitle: (taskId: number) => void;
}

type SetIntId = Dispatch<SetStateAction<number | null>>;

/**
 * Board-view preference mutations the shortcuts layer triggers. Kept narrow so the shortcuts
 * module does not pull in the full `useMutation` type surface from `@tanstack/react-query`.
 */
interface ViewPrefMutators {
  setBoardLayout: (boardId: number, layout: "lanes" | "stacked") => void;
  setShowStats: (boardId: number, showStats: boolean) => void;
}

export interface BoardShortcutActionsDeps {
  openHelp: () => void;
  openBoardSearch: () => void;
  toggleFilters: () => void;
  nav: NavDeps | null;
  bridge: BridgeDeps | null;
  queryClient: QueryClient;
  viewPrefs: ViewPrefMutators;
  /** Current tasks on the active board; used to resolve a list id from the highlighted task. */
  getBoardTasks: () => readonly BoardTask[];
  statuses: readonly Status[] | undefined;
  workflowOrder: readonly string[];
  persistTaskUpdate: PersistTaskUpdate;
  celebrateTaskCompletion?: (taskId: number) => void;
  setActiveTaskGroupIdsForBoard: (
    boardId: string | number,
    groupIds: string[] | undefined,
  ) => void;
  setActiveTaskPriorityIdsForBoard: (
    boardId: string | number,
    priorityIds: string[] | undefined,
  ) => void;
  setTaskCardViewModeForBoard: (
    boardId: string | number,
    mode: TaskCardViewMode,
  ) => void;
  setTaskDeleteConfirmId: SetIntId;
  setListDeleteConfirmId: SetIntId;
  pendingGroupSavesRef: PendingSaveTimeoutsRef;
  pendingGroupTasksRef: PendingTasksRef;
  pendingPrioritySavesRef: PendingSaveTimeoutsRef;
  pendingPriorityTasksRef: PendingTasksRef;
}

/** Build the board shortcut action surface from its runtime dependencies. */
export function createBoardShortcutActions(
  deps: BoardShortcutActionsDeps,
): BoardShortcutActions {
  const {
    openHelp,
    openBoardSearch,
    toggleFilters,
    nav,
    bridge,
    queryClient,
    viewPrefs,
    getBoardTasks,
    statuses,
    workflowOrder,
    persistTaskUpdate,
    celebrateTaskCompletion,
    setActiveTaskGroupIdsForBoard,
    setActiveTaskPriorityIdsForBoard,
    setTaskCardViewModeForBoard,
    setTaskDeleteConfirmId,
    setListDeleteConfirmId,
    pendingGroupSavesRef,
    pendingGroupTasksRef,
    pendingPrioritySavesRef,
    pendingPriorityTasksRef,
  } = deps;

  /** `T` / `L` fall back to the highlighted task's list so a selection alone is enough to anchor. */
  const listIdFromHighlight = (tasks: readonly BoardTask[]): number | null => {
    if (nav?.highlightedListId != null) return nav.highlightedListId;
    const highlightedTaskId = nav?.highlightedTaskId ?? null;
    if (highlightedTaskId == null) return null;
    return tasks.find((task) => task.taskId === highlightedTaskId)?.listId ?? null;
  };

  return {
    openHelp,
    openBoardSearch,
    toggleFilters,
    cycleTaskCardViewMode: (board) =>
      cycleTaskCardViewModeForBoard(board, setTaskCardViewModeForBoard),
    toggleBoardLayout: (board) => {
      const current = board.boardLayout === "lanes" ? "lanes" : "stacked";
      viewPrefs.setBoardLayout(
        board.boardId,
        current === "lanes" ? "stacked" : "lanes",
      );
    },
    cycleTaskGroup: (board) =>
      cycleTaskGroupForBoard(board, setActiveTaskGroupIdsForBoard),
    allTaskGroups: (board) =>
      setActiveTaskGroupIdsForBoard(board.boardId, undefined),
    cycleTaskPriority: (board) =>
      cycleTaskPriorityForBoard(board, setActiveTaskPriorityIdsForBoard),
    cycleHighlightedTaskGroup: (board) =>
      cycleHighlightedTaskGroupForBoard(
        board,
        nav?.highlightedTaskId,
        queryClient,
        pendingGroupSavesRef,
        pendingGroupTasksRef,
        persistTaskUpdate,
      ),
    cycleHighlightedTaskPriority: (board) =>
      cycleHighlightedTaskPriorityForBoard(
        board,
        nav?.highlightedTaskId,
        queryClient,
        pendingPrioritySavesRef,
        pendingPriorityTasksRef,
        persistTaskUpdate,
      ),
    focusOrScrollHighlight: () => nav?.focusOrScrollHighlight(),
    moveHighlight: (direction) => nav?.moveHighlight(direction),
    highlightHome: () => nav?.highlightHome(),
    highlightEnd: () => nav?.highlightEnd(),
    highlightPage: (direction) => nav?.highlightPage(direction),
    openHighlightedTask: () => {
      const highlightedTaskId = nav?.highlightedTaskId;
      if (highlightedTaskId != null) {
        bridge?.requestOpenTaskEditor(highlightedTaskId);
      }
    },
    editHighlightedTaskTitle: () => {
      const listId = nav?.highlightedListId;
      if (listId != null) {
        nav?.openRenameForList(listId);
        return;
      }
      const highlightedTaskId = nav?.highlightedTaskId;
      if (highlightedTaskId != null) {
        bridge?.requestEditTaskTitle(highlightedTaskId);
      }
    },
    requestDeleteHighlight: () => {
      if (nav?.highlightedListId != null) {
        setListDeleteConfirmId(nav.highlightedListId);
        return;
      }
      const highlightedTaskId = nav?.highlightedTaskId;
      if (highlightedTaskId != null) {
        setTaskDeleteConfirmId(highlightedTaskId);
      }
    },
    addTaskAtHighlight: () => {
      const listId = listIdFromHighlight(getBoardTasks());
      if (listId == null) return;
      nav?.openAddTaskForList(listId);
    },
    addListAfterHighlight: (board) => {
      const anchorListId = listIdFromHighlight(board.tasks);
      if (anchorListId == null) return;
      nav?.openAddListComposerAfter(anchorListId);
    },
    completeHighlightedTask: (board) =>
      completeHighlightedTaskForBoard(
        board,
        nav?.highlightedTaskId,
        statuses,
        persistTaskUpdate,
        celebrateTaskCompletion,
      ),
    toggleBoardStats: (board) => {
      viewPrefs.setShowStats(board.boardId, !board.showStats);
    },
    reopenHighlightedTask: (board) =>
      reopenHighlightedTaskForBoard(
        board,
        nav?.highlightedTaskId,
        statuses,
        workflowOrder,
        persistTaskUpdate,
      ),
    assignDefaultReleaseToHighlightedTask: (board) =>
      assignDefaultReleaseToHighlightedTaskForBoard(
        board,
        nav?.highlightedTaskId,
        persistTaskUpdate,
      ),
  };
}
