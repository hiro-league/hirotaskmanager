import { useMemo } from "react";
import type { Board, Task } from "../../../../shared/models";
import { useStatusWorkflowOrder } from "@/api/queries";
import {
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import { hashTasksForDndLayoutDeps } from "./boardTaskDndDeps";
import {
  buildTasksByListStatusIndex,
  type BoardTaskFilterState,
  visibleStatusesForBoard,
} from "../boardStatusUtils";

type BuildBoardDndContainerMap = (
  listIds: readonly number[],
  taskFilter: BoardTaskFilterState,
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>,
) => Record<string, string[]>;

interface UseBoardDndContainerContextResult {
  serverTaskMap: Record<string, string[]>;
  containerMapDeps: string;
  taskFilter: BoardTaskFilterState;
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
}

export function useBoardDndContainerContext(
  board: Board,
  listIds: readonly number[],
  buildContainerMap: BuildBoardDndContainerMap,
): UseBoardDndContainerContextResult {
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
  const activeReleaseIds = useResolvedActiveReleaseIds(board.boardId, board.releases);
  const dateFilterResolved = useResolvedTaskDateFilter(board.boardId);

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
    () => buildContainerMap(listIds, taskFilter, tasksByListStatus),
    [buildContainerMap, listIds, taskFilter, tasksByListStatus, containerMapDeps],
  );

  return {
    serverTaskMap,
    containerMapDeps,
    taskFilter,
    tasksByListStatus,
  };
}
