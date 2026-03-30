import { useMemo } from "react";
import type { Board } from "../../../shared/models";
import { ALL_TASK_GROUPS } from "../../../shared/models";
import { useReorderTasksInBand, useUpdateTask } from "@/api/mutations";
import { useStatusWorkflowOrder } from "@/api/queries";
import { useResolvedActiveTaskGroup } from "@/store/preferences";
import {
  laneBandContainerId,
  parseLaneBandContainerId,
  parseTaskSortableId,
  sortableTaskId,
} from "./dndIds";
import { useHorizontalListReorder } from "./useHorizontalListReorder";
import { visibleStatusesForBoard } from "./boardStatusUtils";
import {
  mergeFilteredOrderIntoFullBand,
  useTaskDndCore,
} from "./useTaskDndCore";

/**
 * Build one container per (list, status) band. Each container holds the
 * sortable task IDs for that band, filtered by the active group.
 */
function buildLanesTaskContainerMap(
  board: Board,
  listIds: number[],
  visibleStatuses: string[],
  activeGroup: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const listId of listIds) {
    for (const status of visibleStatuses) {
      const key = laneBandContainerId(listId, status);
      let tasks = board.tasks
        .filter((t) => t.listId === listId && t.status === status)
        .sort((a, b) => a.order - b.order);
      if (activeGroup !== ALL_TASK_GROUPS) {
        tasks = tasks.filter((t) => String(t.groupId) === activeGroup);
      }
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
async function persistLanesChanges(
  board: Board,
  prev: Record<string, string[]>,
  next: Record<string, string[]>,
  updateTask: ReturnType<typeof useUpdateTask>,
  reorderBand: ReturnType<typeof useReorderTasksInBand>,
): Promise<void> {
  let b = board;

  const patchNeeded: { taskId: number; listId: number; status: string }[] = [];
  for (const key of Object.keys(next)) {
    const meta = parseLaneBandContainerId(key);
    if (!meta) continue;
    for (const sid of next[key]) {
      const tid = parseTaskSortableId(sid);
      if (tid == null) continue;
      const t = b.tasks.find((x) => x.id === tid);
      if (!t) continue;
      if (t.listId !== meta.listId || t.status !== meta.status) {
        patchNeeded.push({ taskId: tid, listId: meta.listId, status: meta.status });
      }
    }
  }

  for (const { taskId, listId, status } of patchNeeded) {
    const t = b.tasks.find((x) => x.id === taskId);
    if (!t) continue;
    b = await updateTask.mutateAsync({
      boardId: b.id,
      task: { ...t, listId, status },
    });
  }

  const changedKeys = new Set<string>();
  for (const key of Object.keys(next)) {
    const prevIds = prev[key] ?? [];
    const nextIds = next[key];
    if (prevIds.join(",") !== nextIds.join(",")) {
      changedKeys.add(key);
    }
  }
  for (const key of Object.keys(prev)) {
    if (!next[key] && prev[key].length > 0) changedKeys.add(key);
  }

  for (const key of changedKeys) {
    const meta = parseLaneBandContainerId(key);
    if (!meta) continue;

    const filteredIds: number[] = [];
    for (const sid of next[key] ?? []) {
      const tid = parseTaskSortableId(sid);
      if (tid != null) filteredIds.push(tid);
    }

    const serverBand = b.tasks
      .filter((t) => t.listId === meta.listId && t.status === meta.status)
      .sort((a, c) => a.order - c.order)
      .map((t) => t.id);

    const fullOrder = mergeFilteredOrderIntoFullBand(serverBand, filteredIds);

    if (fullOrder.join(",") === serverBand.join(",")) continue;

    b = await reorderBand.mutateAsync({
      boardId: b.id,
      listId: meta.listId,
      status: meta.status,
      orderedTaskIds: fullOrder,
    });
  }
}

export function useLanesBoardDnd(board: Board) {
  const list = useHorizontalListReorder(board);
  const workflowOrder = useStatusWorkflowOrder();
  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board, workflowOrder),
    [board, workflowOrder],
  );
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);

  const tasksLayoutSig = useMemo(
    () =>
      board.tasks
        .map((t) => `${t.id}:${t.listId}:${t.status}:${t.order}:${t.groupId}`)
        .join("|"),
    [board.tasks],
  );

  const containerMapDeps = `${board.id}|${board.updatedAt}|${tasksLayoutSig}|${list.localListIds.join(",")}|${visibleStatuses.join("\0")}|${activeGroup}`;

  const config = useMemo(
    () => ({
      buildContainerMap: () =>
        buildLanesTaskContainerMap(
          board,
          list.localListIds,
          visibleStatuses,
          activeGroup,
        ),
      persistChanges: persistLanesChanges,
      containerMapDeps,
    }),
    [board, list.localListIds, visibleStatuses, activeGroup, containerMapDeps],
  );

  const core = useTaskDndCore(board, list, config);

  return {
    ...core,
    visibleStatuses,
    activeGroup,
  };
}
