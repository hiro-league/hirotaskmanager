import { useMemo } from "react";
import type { Board } from "../../../shared/models";
import { useReorderTasksInBand, useUpdateTask } from "@/api/mutations";
import { useStatusWorkflowOrder } from "@/api/queries";
import { useResolvedActiveTaskGroup } from "@/store/preferences";
import {
  parseStackedListContainerId,
  parseTaskSortableId,
  sortableTaskId,
  stackedListContainerId,
} from "./dndIds";
import {
  listTasksMergedSorted,
  visibleStatusesForBoard,
} from "./boardStatusUtils";
import {
  mergeFilteredOrderIntoFullBand,
  useBoardTaskDndReact,
} from "./useBoardTaskDndReact";
import { useHorizontalListReorderReact } from "./useHorizontalListReorderReact";

function buildStackedTaskContainerMap(
  board: Board,
  listIds: number[],
  visibleStatuses: string[],
  activeGroup: string,
  workflowOrder: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const listId of listIds) {
    const key = stackedListContainerId(listId);
    const tasks = listTasksMergedSorted(
      board,
      listId,
      visibleStatuses,
      activeGroup,
      workflowOrder,
    );
    out[key] = tasks.map((t) => sortableTaskId(t.id));
  }
  return out;
}

async function persistStackedChanges(
  board: Board,
  prev: Record<string, string[]>,
  next: Record<string, string[]>,
  updateTask: ReturnType<typeof useUpdateTask>,
  reorderBand: ReturnType<typeof useReorderTasksInBand>,
): Promise<void> {
  let b = board;

  const movedTasks: { taskId: number; newListId: number }[] = [];
  for (const key of Object.keys(next)) {
    const listId = parseStackedListContainerId(key);
    if (listId == null) continue;
    for (const sid of next[key]) {
      const tid = parseTaskSortableId(sid);
      if (tid == null) continue;
      const t = b.tasks.find((x) => x.id === tid);
      if (!t) continue;
      if (t.listId !== listId) {
        movedTasks.push({ taskId: tid, newListId: listId });
      }
    }
  }

  for (const { taskId, newListId } of movedTasks) {
    const t = b.tasks.find((x) => x.id === taskId);
    if (!t) continue;
    b = await updateTask.mutateAsync({
      boardId: b.id,
      task: { ...t, listId: newListId },
    });
  }

  const affectedBands = new Set<string>();
  for (const key of Object.keys(next)) {
    const listId = parseStackedListContainerId(key);
    if (listId == null) continue;
    const prevIds = prev[key] ?? [];
    const nextIds = next[key];
    if (prevIds.join(",") !== nextIds.join(",")) {
      for (const sid of nextIds) {
        const tid = parseTaskSortableId(sid);
        if (tid == null) continue;
        const t = b.tasks.find((x) => x.id === tid);
        if (t) affectedBands.add(`${listId}:${t.status}`);
      }
      for (const sid of prevIds) {
        const tid = parseTaskSortableId(sid);
        if (tid == null) continue;
        const t = b.tasks.find((x) => x.id === tid);
        if (t) affectedBands.add(`${t.listId}:${t.status}`);
      }
    }
  }

  for (const bandKey of affectedBands) {
    const sep = bandKey.indexOf(":");
    const listId = Number(bandKey.slice(0, sep));
    const status = bandKey.slice(sep + 1);

    const containerKey = stackedListContainerId(listId);
    const containerIds = next[containerKey] ?? [];

    const filteredBandIds: number[] = [];
    for (const sid of containerIds) {
      const tid = parseTaskSortableId(sid);
      if (tid == null) continue;
      const t = b.tasks.find((x) => x.id === tid);
      if (t && t.status === status) {
        filteredBandIds.push(tid);
      }
    }

    const serverBand = b.tasks
      .filter((t) => t.listId === listId && t.status === status)
      .sort((a, c) => a.order - c.order)
      .map((t) => t.id);

    const fullOrder = mergeFilteredOrderIntoFullBand(serverBand, filteredBandIds);

    if (fullOrder.join(",") === serverBand.join(",")) continue;

    b = await reorderBand.mutateAsync({
      boardId: b.id,
      listId,
      status,
      orderedTaskIds: fullOrder,
    });
  }
}

export function useStackedBoardDnd(board: Board, listIdsOverride?: number[]) {
  const list = useHorizontalListReorderReact(board);
  const workflowOrder = useStatusWorkflowOrder();
  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board, workflowOrder),
    [board, workflowOrder],
  );
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);

  const listIds = listIdsOverride ?? list.localListIds;

  const tasksLayoutSig = useMemo(
    () =>
      board.tasks
        .map((t) => `${t.id}:${t.listId}:${t.status}:${t.order}:${t.groupId}`)
        .join("|"),
    [board.tasks],
  );

  const containerMapDeps = `${board.id}|${board.updatedAt}|${tasksLayoutSig}|${listIds.join(",")}|${visibleStatuses.join("\0")}|${activeGroup}`;

  const serverTaskMap = useMemo(
    () =>
      buildStackedTaskContainerMap(
        board,
        listIds,
        visibleStatuses,
        activeGroup,
        workflowOrder,
      ),
    [containerMapDeps, board, listIds, visibleStatuses, activeGroup, workflowOrder],
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
  };
}
