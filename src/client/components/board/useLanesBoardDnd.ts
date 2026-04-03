import { useCallback, useMemo } from "react";
import type { Board } from "../../../shared/models";
import { useReorderTasksInBand, useUpdateTask } from "@/api/mutations";
import { useStatuses, useStatusWorkflowOrder } from "@/api/queries";
import { useBoardTaskCompletionCelebrationOptional } from "@/gamification";
import {
  useResolvedActiveTaskGroup,
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
  listStatusTasksSorted,
  visibleStatusesForBoard,
  type BoardTaskFilterState,
} from "./boardStatusUtils";
import {
  mergeFilteredOrderIntoFullBand,
  useBoardTaskDndReact,
} from "./useBoardTaskDndReact";
import { useHorizontalListReorderReact } from "./useHorizontalListReorderReact";

/**
 * Build one container per (list, status) band. Each container holds the
 * sortable task IDs for that band, filtered by the shared board task predicate.
 */
function buildLanesTaskContainerMap(
  board: Board,
  listIds: number[],
  filter: BoardTaskFilterState,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const listId of listIds) {
    for (const status of filter.visibleStatuses) {
      const key = laneBandContainerId(listId, status);
      // Route lanes through the shared board predicate so date/group/priority
      // filters stay consistent with the visible cards and keyboard navigation.
      const tasks = listStatusTasksSorted(board, listId, status, filter);
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
  prev: Record<string, string[]>,
  next: Record<string, string[]>,
  updateTask: ReturnType<typeof useUpdateTask>,
  reorderBand: ReturnType<typeof useReorderTasksInBand>,
  opts?: PersistLanesChangesOpts,
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
    if (opts?.closedStatusIds.size && opts.onTaskClosed) {
      const wasClosed = opts.closedStatusIds.has(t.status);
      const willClose = opts.closedStatusIds.has(status);
      if (!wasClosed && willClose) opts.onTaskClosed(taskId);
    }
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
    () => buildLanesTaskContainerMap(board, listIds, taskFilter),
    [
      containerMapDeps,
      board,
      listIds,
      taskFilter,
    ],
  );

  const persistChanges = useCallback(
    async (
      b: Board,
      prev: Record<string, string[]>,
      next: Record<string, string[]>,
      updateTask: ReturnType<typeof useUpdateTask>,
      reorderBand: ReturnType<typeof useReorderTasksInBand>,
    ) => {
      await persistLanesChanges(b, prev, next, updateTask, reorderBand, {
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
    activeGroup,
    activePriorityIds,
  };
}
