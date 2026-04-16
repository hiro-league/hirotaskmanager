import type { Board, Task } from "../../../../shared/models";
import { useMoveTask } from "@/api/mutations";
import {
  parseStackedListContainerId,
  parseTaskSortableId,
  sortableTaskId,
  stackedListContainerId,
} from "./dndIds";
import {
  type BoardTaskFilterState,
  listTasksMergedSortedFromIndex,
} from "../boardStatusUtils";
import { useBoardDndContainerContext } from "./useBoardDndContainerContext";
import { useBoardTaskDndReact } from "./useBoardTaskDndReact";
import { useHorizontalListReorderReact } from "./useHorizontalListReorderReact";

function buildStackedTaskContainerMap(
  listIds: readonly number[],
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
  const listIds = listIdsOverride ?? list.localListIds;
  const { serverTaskMap, containerMapDeps, taskFilter, tasksByListStatus } =
    useBoardDndContainerContext(
      board,
      listIds,
      buildStackedTaskContainerMap,
    );

  const core = useBoardTaskDndReact(board, list, {
    buildContainerMap: () => serverTaskMap,
    persistChanges: persistStackedChanges,
    containerMapDeps,
  });

  return {
    ...core,
    visibleStatuses: [...taskFilter.visibleStatuses],
    activeGroupIds: taskFilter.activeGroupIds,
    activePriorityIds: taskFilter.activePriorityIds,
    activeReleaseIds: taskFilter.activeReleaseIds,
    tasksByListStatus,
  };
}
