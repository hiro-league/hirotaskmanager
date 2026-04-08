import { useCallback, useMemo } from "react";
import type { Board, Task } from "../../../shared/models";
import { useMoveTask } from "@/api/mutations";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";
import {
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import {
  laneBandContainerId,
  parseLaneBandContainerId,
  parseTaskSortableId,
  sortableTaskId,
} from "./dndIds";
import {
  buildTasksByListStatusIndex,
  listStatusTasksSortedFromIndex,
  visibleStatusesForBoard,
  type BoardTaskFilterState,
} from "./boardStatusUtils";
import { hashTasksForDndLayoutDeps } from "./boardTaskDndDeps";
import { useBoardTaskDndReact } from "./useBoardTaskDndReact";
import { useHorizontalListReorderReact } from "./useHorizontalListReorderReact";

/**
 * Build one container per (list, status) band. Each container holds the
 * sortable task IDs for that band, filtered by the shared board task predicate.
 */
function buildLanesTaskContainerMap(
  listIds: number[],
  filter: BoardTaskFilterState,
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const listId of listIds) {
    for (const status of filter.visibleStatuses) {
      const key = laneBandContainerId(listId, status);
      // Route lanes through the shared board predicate so date/group/priority
      // filters stay consistent with the visible cards and keyboard navigation.
      const tasks = listStatusTasksSortedFromIndex(
        tasksByListStatus,
        listId,
        status,
        filter,
      );
      out[key] = tasks.map((t) => sortableTaskId(t.id));
    }
  }
  return out;
}

/**
 * Persist lanes drag changes. Unlike stacked, moving between containers
 * changes the task's status (and possibly list). The `updateTask` call
 * handles closedAt/openedAt via the server's PATCH logic.
 */
export interface PersistLanesChangesOpts {
  /** From workflow `status` rows — used to detect first transition into a closed status (celebration). */
  closedStatusIds: ReadonlySet<string>;
  onTaskClosed?: (taskId: number) => void;
}

async function persistLanesChanges(
  board: Board,
  taskId: number,
  _prev: Record<string, string[]>,
  next: Record<string, string[]>,
  moveTask: ReturnType<typeof useMoveTask>,
  opts?: PersistLanesChangesOpts,
): Promise<void> {
  const activeSortableId = sortableTaskId(taskId);
  const destinationKey = Object.keys(next).find((key) =>
    (next[key] ?? []).includes(activeSortableId),
  );
  if (!destinationKey) return;
  const meta = parseLaneBandContainerId(destinationKey);
  if (!meta) return;

  const movedTask = board.tasks.find((task) => task.id === taskId);
  if (!movedTask) return;
  if (opts?.closedStatusIds.size && opts.onTaskClosed) {
    const wasClosed = opts.closedStatusIds.has(movedTask.status);
    const willClose = opts.closedStatusIds.has(meta.status);
    if (!wasClosed && willClose) opts.onTaskClosed(taskId);
  }

  const visibleOrderedTaskIds = (next[destinationKey] ?? [])
    .map((sid) => parseTaskSortableId(sid))
    .filter((tid): tid is number => tid != null);

  await moveTask.mutateAsync({
    boardId: board.id,
    taskId,
    toListId: meta.listId,
    toStatus: meta.status,
    visibleOrderedTaskIds,
  });
}

export function useLanesBoardDnd(board: Board, listIdsOverride?: number[]) {
  const list = useHorizontalListReorderReact(board);
  const celebration = useBoardTaskCompletionCelebrationOptional();
  const { data: statuses } = useStatuses();
  const closedStatusIds = useMemo(
    () => new Set(statuses?.filter((s) => s.isClosed).map((s) => s.id) ?? []),
    [statuses],
  );
  const workflowOrder = useStatusWorkflowOrder();
  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board, workflowOrder),
    [board, workflowOrder],
  );
  const activeGroupIds = useResolvedActiveTaskGroupIds(board.id, board.taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.id,
    board.taskPriorities,
  );
  const activeReleaseIds = useResolvedActiveReleaseIds(board.id, board.releases);
  const dateFilterResolved = useResolvedTaskDateFilter(board.id);

  const listIds = listIdsOverride ?? list.localListIds;

  const tasksLayoutHash = useMemo(
    () => hashTasksForDndLayoutDeps(board.tasks),
    [board.tasks],
  );

  const prioritySig =
    activePriorityIds === null ? "__all__" : activePriorityIds.join("\0");
  const groupSig =
    activeGroupIds === null ? "__all__" : activeGroupIds.join("\0");
  const dateSig =
    dateFilterResolved == null
      ? "__nodate__"
      : `${dateFilterResolved.mode}|${dateFilterResolved.startDate}|${dateFilterResolved.endDate}`;
  const releaseSig =
    activeReleaseIds === null ? "__all__" : activeReleaseIds.join("\0");
  const containerMapDeps = `${board.id}|${board.updatedAt}|${tasksLayoutHash}|${listIds.join(",")}|${visibleStatuses.join("\0")}|${groupSig}|${prioritySig}|${releaseSig}|${dateSig}`;

  const tasksByListStatus = useMemo(
    () => buildTasksByListStatusIndex(board.tasks),
    [board.tasks],
  );

  const taskFilter = useMemo<BoardTaskFilterState>(
    () => ({
      visibleStatuses,
      workflowOrder,
      activeGroupIds,
      activePriorityIds,
      activeReleaseIds,
      dateFilter: dateFilterResolved,
    }),
    [
      visibleStatuses,
      workflowOrder,
      activeGroupIds,
      activePriorityIds,
      activeReleaseIds,
      dateFilterResolved,
    ],
  );

  const serverTaskMap = useMemo(
    () => buildLanesTaskContainerMap(listIds, taskFilter, tasksByListStatus),
    [containerMapDeps, listIds, taskFilter, tasksByListStatus],
  );

  const persistChanges = useCallback(
    async (
      b: Board,
      taskId: number,
      prev: Record<string, string[]>,
      next: Record<string, string[]>,
      moveTask: ReturnType<typeof useMoveTask>,
    ) => {
      await persistLanesChanges(b, taskId, prev, next, moveTask, {
        closedStatusIds,
        onTaskClosed: celebration
          ? (taskId) => celebration.celebrateTaskCompletion({ taskId })
          : undefined,
      });
    },
    [closedStatusIds, celebration],
  );

  const core = useBoardTaskDndReact(board, list, {
    buildContainerMap: () => serverTaskMap,
    persistChanges,
    containerMapDeps,
  });

  return {
    ...core,
    visibleStatuses,
    activeGroupIds,
    activePriorityIds,
    activeReleaseIds,
    /** Shared O(N) task index for list×status bands; same reference while `board.tasks` is unchanged. */
    tasksByListStatus,
  };
}
