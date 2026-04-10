import { useMemo } from "react";
import type { Board, Task } from "../../../shared/models";
import { useMoveTask } from "@/api/mutations";
import { useStatusWorkflowOrder } from "@/api/queries";
import {
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import {
  parseStackedListContainerId,
  parseTaskSortableId,
  sortableTaskId,
  stackedListContainerId,
} from "./dndIds";
import {
  type BoardTaskFilterState,
  buildTasksByListStatusIndex,
  listTasksMergedSortedFromIndex,
  visibleStatusesForBoard,
} from "./boardStatusUtils";
import { hashTasksForDndLayoutDeps } from "./boardTaskDndDeps";
import { useBoardTaskDndReact } from "./useBoardTaskDndReact";
import { useHorizontalListReorderReact } from "./useHorizontalListReorderReact";

function buildStackedTaskContainerMap(
  listIds: number[],
  filter: BoardTaskFilterState,
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const listId of listIds) {
    const key = stackedListContainerId(listId);
    const tasks = listTasksMergedSortedFromIndex(
      tasksByListStatus,
      listId,
      filter,
    );
    out[key] = tasks.map((t) => sortableTaskId(t.taskId));
  }
  return out;
}

async function persistStackedChanges(
  board: Board,
  taskId: number,
  _prev: Record<string, string[]>,
  next: Record<string, string[]>,
  moveTask: ReturnType<typeof useMoveTask>,
): Promise<void> {
  const movedTask = board.tasks.find((task) => task.taskId === taskId);
  if (!movedTask) return;

  const activeSortableId = sortableTaskId(taskId);
  const destinationKey = Object.keys(next).find((key) =>
    (next[key] ?? []).includes(activeSortableId),
  );
  if (!destinationKey) return;
  const toListId = parseStackedListContainerId(destinationKey);
  if (toListId == null) return;

  const visibleOrderedTaskIds = (next[destinationKey] ?? [])
    .map((sid) => parseTaskSortableId(sid))
    .filter((tid): tid is number => tid != null)
    .filter((tid) => {
      if (tid === taskId) return true;
      const task = board.tasks.find((entry) => entry.taskId === tid);
      return task?.status === movedTask.status;
    });

  await moveTask.mutateAsync({
    boardId: board.boardId,
    taskId,
    toListId,
    visibleOrderedTaskIds,
  });
}

export function useStackedBoardDnd(board: Board, listIdsOverride?: number[]) {
  const list = useHorizontalListReorderReact(board);
  const workflowOrder = useStatusWorkflowOrder();
  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board, workflowOrder),
    [board, workflowOrder],
  );
  const activeGroupIds = useResolvedActiveTaskGroupIds(board.boardId, board.taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.boardId,
    board.taskPriorities,
  );
  const dateFilterResolved = useResolvedTaskDateFilter(board.boardId);
  // Must resolve store ids + untagged sentinel so releaseSig/taskFilter match the visible board (hook was missing → ReferenceError at runtime).
  const activeReleaseIds = useResolvedActiveReleaseIds(board.boardId, board.releases);

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
  const containerMapDeps = `${board.boardId}|${board.updatedAt}|${tasksLayoutHash}|${listIds.join(",")}|${visibleStatuses.join("\0")}|${groupSig}|${prioritySig}|${releaseSig}|${dateSig}`;

  const tasksByListStatus = useMemo(
    () => buildTasksByListStatusIndex(board.tasks),
    [board.tasks],
  );

  const taskFilter = useMemo<BoardTaskFilterState>(
    () => ({
      // Shared filter state keeps stacked DnD aligned with the rendered board and nav.
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
    () => buildStackedTaskContainerMap(listIds, taskFilter, tasksByListStatus),
    [containerMapDeps, listIds, taskFilter, tasksByListStatus],
  );

  const core = useBoardTaskDndReact(board, list, {
    buildContainerMap: () => serverTaskMap,
    persistChanges: persistStackedChanges,
    containerMapDeps,
  });

  return {
    ...core,
    visibleStatuses,
    activeGroupIds,
    activePriorityIds,
    activeReleaseIds,
    tasksByListStatus,
  };
}
