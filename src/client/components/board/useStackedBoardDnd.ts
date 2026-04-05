import { useMemo } from "react";
import type { Board } from "../../../shared/models";
import { useMoveTask } from "@/api/mutations";
import { useStatusWorkflowOrder } from "@/api/queries";
import {
  useResolvedActiveTaskGroup,
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
  listTasksMergedSorted,
  visibleStatusesForBoard,
} from "./boardStatusUtils";
import { useBoardTaskDndReact } from "./useBoardTaskDndReact";
import { useHorizontalListReorderReact } from "./useHorizontalListReorderReact";

function buildStackedTaskContainerMap(
  board: Board,
  listIds: number[],
  filter: BoardTaskFilterState,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const listId of listIds) {
    const key = stackedListContainerId(listId);
    const tasks = listTasksMergedSorted(board, listId, filter);
    out[key] = tasks.map((t) => sortableTaskId(t.id));
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
  const movedTask = board.tasks.find((task) => task.id === taskId);
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
      const task = board.tasks.find((entry) => entry.id === tid);
      return task?.status === movedTask.status;
    });

  await moveTask.mutateAsync({
    boardId: board.id,
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
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.id,
    board.taskPriorities,
  );
  const dateFilterResolved = useResolvedTaskDateFilter(board.id);

  const listIds = listIdsOverride ?? list.localListIds;

  const tasksLayoutSig = useMemo(
    () =>
      board.tasks
        .map(
          (t) =>
            `${t.id}:${t.listId}:${t.status}:${t.order}:${t.groupId}:${t.priorityId ?? ""}`,
        )
        .join("|"),
    [board.tasks],
  );

  const prioritySig =
    activePriorityIds === null ? "__all__" : activePriorityIds.join("\0");
  const dateSig =
    dateFilterResolved == null
      ? "__nodate__"
      : `${dateFilterResolved.mode}|${dateFilterResolved.startDate}|${dateFilterResolved.endDate}`;
  const containerMapDeps = `${board.id}|${board.updatedAt}|${tasksLayoutSig}|${listIds.join(",")}|${visibleStatuses.join("\0")}|${activeGroup}|${prioritySig}|${dateSig}`;

  const taskFilter = useMemo<BoardTaskFilterState>(
    () => ({
      // Shared filter state keeps stacked DnD aligned with the rendered board and nav.
      visibleStatuses,
      workflowOrder,
      activeGroup,
      activePriorityIds,
      dateFilter: dateFilterResolved,
    }),
    [
      visibleStatuses,
      workflowOrder,
      activeGroup,
      activePriorityIds,
      dateFilterResolved,
    ],
  );

  const serverTaskMap = useMemo(
    () => buildStackedTaskContainerMap(board, listIds, taskFilter),
    [
      containerMapDeps,
      board,
      listIds,
      taskFilter,
    ],
  );

  const core = useBoardTaskDndReact(board, list, {
    buildContainerMap: () => serverTaskMap,
    persistChanges: persistStackedChanges,
    containerMapDeps,
  });

  return {
    ...core,
    visibleStatuses,
    activeGroup,
    activePriorityIds,
  };
}
