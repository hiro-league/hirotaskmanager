import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Board } from "../../../shared/models";
import { useReorderTasksInBand, useUpdateTask } from "@/api/mutations";
import {
  getOperationSourceData,
  moveGroupedSortableItems,
  type BoardReactDragEndEvent,
  type BoardReactDragOverEvent,
  type BoardReactDragStartEvent,
} from "./dndReactOps";
import { isBoardTaskDragData } from "./dndReactModel";
import { useBoardKeyboardNavOptional } from "./shortcuts/BoardKeyboardNavContext";
import { useHorizontalListReorderReact } from "./useHorizontalListReorderReact";

export interface TaskDndReactConfig {
  buildContainerMap: () => Record<string, string[]>;
  persistChanges: (
    board: Board,
    prev: Record<string, string[]>,
    next: Record<string, string[]>,
    updateTask: ReturnType<typeof useUpdateTask>,
    reorderBand: ReturnType<typeof useReorderTasksInBand>,
  ) => Promise<void>;
  containerMapDeps: string;
}

export function serializeTaskContainerMap(map: Record<string, string[]>): string {
  return Object.keys(map)
    .sort()
    .map((key) => `${key}=${map[key].join(",")}`)
    .join("|");
}

/**
 * Merge a reordered subset of task IDs back into the full server band.
 * Visible tasks keep their new relative order while hidden tasks keep their
 * original slots in the band.
 */
export function mergeFilteredOrderIntoFullBand(
  serverBand: number[],
  filteredNewOrder: number[],
): number[] {
  const filteredSet = new Set(filteredNewOrder);
  if (filteredNewOrder.length === serverBand.length) return filteredNewOrder;

  const result: number[] = [];
  let filteredIdx = 0;

  for (const id of serverBand) {
    if (filteredSet.has(id)) {
      result.push(filteredNewOrder[filteredIdx++]);
    } else {
      result.push(id);
    }
  }

  return result;
}

/**
 * Shared React-first task DnD state for grouped multi-container board drags.
 * Layout hooks keep only their container-map and persistence specifics.
 */
export function useBoardTaskDndReact(
  board: Board,
  list: ReturnType<typeof useHorizontalListReorderReact>,
  config: TaskDndReactConfig,
) {
  const boardNav = useBoardKeyboardNavOptional();
  const updateTask = useUpdateTask();
  const reorderBand = useReorderTasksInBand();

  const serverTaskMap = useMemo(
    () => config.buildContainerMap(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.containerMapDeps],
  );

  const [taskContainers, setTaskContainers] = useState<Record<string, string[]> | null>(
    null,
  );
  const [pendingTaskMap, setPendingTaskMap] = useState<Record<string, string[]> | null>(
    null,
  );
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  const displayTaskMap = taskContainers ?? pendingTaskMap ?? serverTaskMap;

  const boardRef = useRef(board);
  boardRef.current = board;

  const taskContainersRef = useRef(taskContainers);
  taskContainersRef.current = taskContainers;

  const pendingTaskMapRef = useRef(pendingTaskMap);
  pendingTaskMapRef.current = pendingTaskMap;

  const configRef = useRef(config);
  configRef.current = config;

  const taskDragStartMapRef = useRef<Record<string, string[]> | null>(null);

  useEffect(() => {
    if (pendingTaskMap == null) return;
    if (taskContainers != null) return;

    const fromServer = configRef.current.buildContainerMap();
    if (serializeTaskContainerMap(fromServer) === serializeTaskContainerMap(pendingTaskMap)) {
      setPendingTaskMap(null);
    }
  }, [pendingTaskMap, taskContainers, config.containerMapDeps]);

  const onDragStart = useCallback(
    (event: BoardReactDragStartEvent) => {
      const sourceData = getOperationSourceData(event);
      if (!isBoardTaskDragData(sourceData)) {
        list.onDragStart(event);
        return;
      }

      const initial = pendingTaskMapRef.current ?? serverTaskMap;
      taskDragStartMapRef.current = initial;
      setTaskContainers(initial);
      setActiveTaskId(sourceData.taskId);
      // A task drag is an explicit task interaction even if the drop is a no-op.
      boardNav?.selectTask(sourceData.taskId);
    },
    [boardNav, list, serverTaskMap],
  );

  const onDragOver = useCallback(
    (event: BoardReactDragOverEvent) => {
      const sourceData = getOperationSourceData(event);
      if (!isBoardTaskDragData(sourceData)) {
        list.onDragOver(event);
        return;
      }

      if (event.operation.target == null) return;

      setTaskContainers((current) =>
        current == null ? current : moveGroupedSortableItems(current, event),
      );
    },
    [list],
  );

  const onDragEnd = useCallback(
    (event: BoardReactDragEndEvent) => {
      const sourceData = getOperationSourceData(event);
      if (!isBoardTaskDragData(sourceData)) {
        list.onDragEnd(event);
        return;
      }

      setActiveTaskId(null);

      const startMap = taskDragStartMapRef.current;
      const endMap = taskContainersRef.current;

      taskDragStartMapRef.current = null;
      setTaskContainers(null);

      if (event.canceled || !startMap || !endMap) {
        return;
      }

      if (serializeTaskContainerMap(startMap) === serializeTaskContainerMap(endMap)) {
        return;
      }

      setPendingTaskMap(endMap);

      void configRef.current
        .persistChanges(boardRef.current, startMap, endMap, updateTask, reorderBand)
        .finally(() => setPendingTaskMap(null));
    },
    [list, reorderBand, updateTask],
  );

  return {
    ...list,
    displayTaskMap,
    activeTaskId,
    onDragStart,
    onDragOver,
    onDragEnd,
  };
}
