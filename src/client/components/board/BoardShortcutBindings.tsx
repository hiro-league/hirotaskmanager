import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import {
  usePatchBoardViewPrefs,
  useUpdateTask,
} from "@/api/mutations";
import { useBoardFiltersStore } from "@/store/preferences";
import type { Board } from "../../../shared/models";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";
import { useBoardTaskKeyboardBridgeOptional } from "./shortcuts/BoardTaskKeyboardBridge";
import { useBoardKeyboardNavOptional } from "./shortcuts/BoardKeyboardNavContext";
import { createBoardShortcutActions } from "./shortcuts/boardShortcutActions";
import type { BoardShortcutBoard } from "./shortcuts/boardShortcutTypes";
import { useBoardShortcutKeydown } from "./shortcuts/useBoardShortcutKeydown";

interface BoardShortcutBindingsProps {
  boardId: number;
  boardLayout: Board["boardLayout"];
  defaultReleaseId: number | null;
  releases: Board["releases"];
  showStats: boolean;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  tasks: Board["tasks"];
  openHelp: () => void;
  openBoardSearch: () => void;
  toggleFilters: () => void;
  setTaskDeleteConfirmId: Dispatch<SetStateAction<number | null>>;
  setListDeleteConfirmId: Dispatch<SetStateAction<number | null>>;
}

export function BoardShortcutBindings({
  boardId,
  boardLayout,
  defaultReleaseId,
  releases,
  showStats,
  taskGroups,
  taskPriorities,
  tasks,
  openHelp,
  openBoardSearch,
  toggleFilters,
  setTaskDeleteConfirmId,
  setListDeleteConfirmId,
}: BoardShortcutBindingsProps) {
  const setActiveTaskGroupIdsForBoard = useBoardFiltersStore(
    (state) => state.setActiveTaskGroupIdsForBoard,
  );
  const setTaskCardViewModeForBoard = useBoardFiltersStore(
    (state) => state.setTaskCardViewModeForBoard,
  );
  const setActiveTaskPriorityIdsForBoard = useBoardFiltersStore(
    (state) => state.setActiveTaskPriorityIdsForBoard,
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
  const pendingPriorityTasksRef = useRef(
    new Map<number, Board["tasks"][number]>(),
  );
  const pendingGroupSavesRef = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );
  const pendingGroupTasksRef = useRef(new Map<number, Board["tasks"][number]>());
  const patchViewPrefs = usePatchBoardViewPrefs();
  const persistTaskUpdate = useCallback(
    (targetBoardId: number, task: Board["tasks"][number]) => {
      updateTask.mutate({ boardId: targetBoardId, task });
    },
    [updateTask],
  );

  const shortcutBoard = useMemo<BoardShortcutBoard>(
    () => ({
      boardId,
      boardLayout,
      defaultReleaseId,
      releases,
      showStats,
      taskGroups,
      taskPriorities,
      tasks,
    }),
    [
      boardId,
      boardLayout,
      defaultReleaseId,
      releases,
      showStats,
      taskGroups,
      taskPriorities,
      tasks,
    ],
  );

  // `getBoardTasks` is ref-backed so the actions factory only depends on stable refs for
  // the tasks slice; avoids rebuilding the action bundle every time tasks change.
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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

  const actions = useMemo(
    () =>
      createBoardShortcutActions({
        openHelp,
        openBoardSearch,
        toggleFilters,
        nav,
        bridge,
        queryClient,
        viewPrefs: {
          setBoardLayout: (targetBoardId, layout) =>
            patchViewPrefs.mutate({
              boardId: targetBoardId,
              patch: { boardLayout: layout },
            }),
          setShowStats: (targetBoardId, nextShowStats) =>
            patchViewPrefs.mutate({
              boardId: targetBoardId,
              patch: { showStats: nextShowStats },
            }),
        },
        getBoardTasks: () => tasksRef.current,
        statuses,
        workflowOrder,
        persistTaskUpdate,
        celebrateTaskCompletion: completion
          ? (taskId) => completion.celebrateTaskCompletion({ taskId })
          : undefined,
        setActiveTaskGroupIdsForBoard,
        setActiveTaskPriorityIdsForBoard,
        setTaskCardViewModeForBoard,
        setTaskDeleteConfirmId,
        setListDeleteConfirmId,
        pendingGroupSavesRef,
        pendingGroupTasksRef,
        pendingPrioritySavesRef,
        pendingPriorityTasksRef,
      }),
    [
      openHelp,
      openBoardSearch,
      toggleFilters,
      nav,
      bridge,
      queryClient,
      patchViewPrefs,
      statuses,
      workflowOrder,
      persistTaskUpdate,
      completion,
      setActiveTaskGroupIdsForBoard,
      setActiveTaskPriorityIdsForBoard,
      setTaskCardViewModeForBoard,
      setTaskDeleteConfirmId,
      setListDeleteConfirmId,
    ],
  );

  useBoardShortcutKeydown({
    board: nav && bridge ? shortcutBoard : null,
    actions,
  });

  return null;
}
