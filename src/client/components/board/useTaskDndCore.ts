import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Board } from "../../../shared/models";
import { useReorderTasksInBand, useUpdateTask } from "@/api/mutations";
import {
  parseListSortableId,
  parseTaskSortableId,
} from "./dndIds";
import { listCollision, useHorizontalListReorder } from "./useHorizontalListReorder";

function isContainerKey(
  map: Record<string, string[]>,
  id: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(map, id);
}

function buildReverseIndex(
  map: Record<string, string[]>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const key of Object.keys(map)) {
    for (const sid of map[key]) {
      out.set(sid, key);
    }
  }
  return out;
}

function findTaskContainer(
  map: Record<string, string[]>,
  reverseIdx: Map<string, string>,
  id: string,
): string | undefined {
  if (isContainerKey(map, id)) return id;
  return reverseIdx.get(id);
}

export function serializeMap(map: Record<string, string[]>): string {
  return Object.keys(map)
    .sort()
    .map((k) => `${k}=${map[k].join(",")}`)
    .join("|");
}

/**
 * Merge a reordered subset of task IDs back into the full server band.
 * Filtered (visible) tasks get their new relative order; hidden tasks keep
 * their original positions in the gaps between visible ones.
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

export interface TaskDndCoreConfig {
  buildContainerMap: () => Record<string, string[]>;
  persistChanges: (
    board: Board,
    prev: Record<string, string[]>,
    next: Record<string, string[]>,
    updateTask: ReturnType<typeof useUpdateTask>,
    reorderBand: ReturnType<typeof useReorderTasksInBand>,
  ) => Promise<void>;
  /** Primitive signature that changes when the container map should be recomputed. */
  containerMapDeps: string;
}

/**
 * Shared task drag-and-drop state machine used by both stacked and lanes layouts.
 * Handles: container state, reverse index, drag-over reordering, pending map,
 * collision detection dispatch, and persistence.
 */
export function useTaskDndCore(
  board: Board,
  list: ReturnType<typeof useHorizontalListReorder>,
  config: TaskDndCoreConfig,
) {
  const updateTask = useUpdateTask();
  const reorderBand = useReorderTasksInBand();

  const [taskContainers, setTaskContainers] = useState<Record<
    string,
    string[]
  > | null>(null);
  const [pendingTaskMap, setPendingTaskMap] = useState<Record<
    string,
    string[]
  > | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  const taskContainersRef = useRef(taskContainers);
  taskContainersRef.current = taskContainers;

  const reverseIdxRef = useRef<Map<string, string>>(new Map());

  const taskDragStartMapRef = useRef<Record<string, string[]> | null>(null);
  const activeKindRef = useRef<"list" | "task" | null>(null);

  const boardRef = useRef(board);
  boardRef.current = board;

  const configRef = useRef(config);
  configRef.current = config;

  const serverTaskMap = useMemo(
    () => config.buildContainerMap(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.containerMapDeps],
  );

  const displayTaskMap =
    taskContainers ?? pendingTaskMap ?? serverTaskMap;

  useEffect(() => {
    if (pendingTaskMap == null) return;
    if (taskContainers != null) return;
    const fromServer = configRef.current.buildContainerMap();
    if (serializeMap(fromServer) === serializeMap(pendingTaskMap)) {
      setPendingTaskMap(null);
    }
  }, [board, config.containerMapDeps, pendingTaskMap, taskContainers]);

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (activeKindRef.current === "list") return listCollision(args);
      return closestCenter(args);
    },
    [],
  );

  const updateContainers = useCallback(
    (updater: (prev: Record<string, string[]>) => Record<string, string[]> | null) => {
      setTaskContainers((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (next) reverseIdxRef.current = buildReverseIndex(next);
        return next;
      });
    },
    [],
  );

  const handleTaskDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      const overId = over?.id != null ? String(over.id) : null;
      if (overId == null || String(active.id) === overId) return;

      const items = taskContainersRef.current;
      if (!items) return;

      const idx = reverseIdxRef.current;
      const activeContainer = findTaskContainer(items, idx, String(active.id));
      const overContainer = findTaskContainer(items, idx, overId);
      if (!activeContainer || !overContainer) return;

      if (activeContainer === overContainer) {
        updateContainers((prev) => {
          const activeIndex = prev[activeContainer].indexOf(String(active.id));
          const overIndex = prev[overContainer].indexOf(overId);
          if (activeIndex < 0 || overIndex < 0) return prev;
          if (activeIndex === overIndex) return prev;
          return {
            ...prev,
            [activeContainer]: arrayMove(
              prev[activeContainer],
              activeIndex,
              overIndex,
            ),
          };
        });
        return;
      }

      updateContainers((prev) => {
        const activeItems = [...prev[activeContainer]];
        const overItems = [...prev[overContainer]];
        const activeIndex = activeItems.indexOf(String(active.id));
        if (activeIndex < 0) return prev;

        const [moved] = activeItems.splice(activeIndex, 1);

        let newIndex: number;
        if (isContainerKey(prev, overId)) {
          newIndex = overItems.length;
        } else {
          const overIndex = overItems.indexOf(overId);
          const isBelowOver =
            over &&
            active.rect.current.translated &&
            active.rect.current.translated.top >
              over.rect.top + over.rect.height;
          const modifier = isBelowOver ? 1 : 0;
          newIndex =
            overIndex >= 0 ? overIndex + modifier : overItems.length;
          if (overIndex >= 0) {
            newIndex = Math.min(newIndex, overItems.length);
          }
        }

        overItems.splice(newIndex, 0, moved);
        return {
          ...prev,
          [activeContainer]: activeItems,
          [overContainer]: overItems,
        };
      });
    },
    [updateContainers],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      if (parseListSortableId(event.active.id) != null) {
        activeKindRef.current = "list";
        list.onDragStart(event);
        return;
      }
      const tid = parseTaskSortableId(event.active.id);
      if (tid != null) {
        activeKindRef.current = "task";
        const initial = configRef.current.buildContainerMap();
        taskDragStartMapRef.current = initial;
        reverseIdxRef.current = buildReverseIndex(initial);
        setTaskContainers({ ...initial });
        setActiveTaskId(tid);
      }
    },
    [list],
  );

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      if (activeKindRef.current === "list") {
        list.onDragOver(event);
        return;
      }
      handleTaskDragOver(event);
    },
    [list, handleTaskDragOver],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (activeKindRef.current === "list") {
        activeKindRef.current = null;
        list.onDragEnd(event);
        return;
      }

      activeKindRef.current = null;
      setActiveTaskId(null);

      const startMap = taskDragStartMapRef.current;
      taskDragStartMapRef.current = null;
      const endMap = taskContainersRef.current;
      setTaskContainers(null);

      if (!startMap || !endMap) return;

      if (serializeMap(startMap) === serializeMap(endMap)) return;

      setPendingTaskMap(endMap);
      void configRef.current
        .persistChanges(boardRef.current, startMap, endMap, updateTask, reorderBand)
        .finally(() => setPendingTaskMap(null));
    },
    [list, updateTask, reorderBand],
  );

  const onDragCancel = useCallback(() => {
    if (activeKindRef.current === "list") {
      list.onDragCancel();
    } else {
      setActiveTaskId(null);
      setTaskContainers(null);
      setPendingTaskMap(null);
      reverseIdxRef.current = new Map();
    }
    activeKindRef.current = null;
    taskDragStartMapRef.current = null;
  }, [list]);

  return {
    ...list,
    displayTaskMap,
    activeTaskId,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
