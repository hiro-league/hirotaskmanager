import { useCallback, useMemo } from "react";
import type { Board, Task } from "../../../../shared/models";
import { useMoveTask } from "@/api/mutations";
import { useStatuses } from "@/api/queries";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";
import {
  laneBandContainerId,
  parseLaneBandContainerId,
  parseTaskSortableId,
  sortableTaskId,
} from "./dndIds";
import {
  listStatusTasksSortedFromIndex,
  type BoardTaskFilterState,
} from "../boardStatusUtils";
import { useBoardDndContainerContext } from "./useBoardDndContainerContext";
import { useBoardTaskDndReact } from "./useBoardTaskDndReact";
import { useHorizontalListReorderReact } from "./useHorizontalListReorderReact";

/**
 * Build one container per (list, status) band. Each container holds the
 * sortable task IDs for that band, filtered by the shared board task predicate.
 */
function buildLanesTaskContainerMap(
  listIds: readonly number[],
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
      out[key] = tasks.map((t) => sortableTaskId(t.taskId));
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

  const movedTask = board.tasks.find((task) => task.taskId === taskId);
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
    boardId: board.boardId,
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
    () => new Set(statuses?.filter((s) => s.isClosed).map((s) => s.statusId) ?? []),
    [statuses],
  );
  const listIds = listIdsOverride ?? list.localListIds;
  const { serverTaskMap, containerMapDeps, taskFilter, tasksByListStatus } =
    useBoardDndContainerContext(
      board,
      listIds,
      buildLanesTaskContainerMap,
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
    visibleStatuses: [...taskFilter.visibleStatuses],
    activeGroupIds: taskFilter.activeGroupIds,
    activePriorityIds: taskFilter.activePriorityIds,
    activeReleaseIds: taskFilter.activeReleaseIds,
    /** Shared O(N) task index for list×status bands; same reference while `board.tasks` is unchanged. */
    tasksByListStatus,
  };
}
