import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { Board } from "../../../../shared/models";
import { useStatusWorkflowOrder } from "@/api/queries";
import {
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import {
  buildTasksByListStatusIndex,
  visibleStatusesForBoard,
  type BoardTaskFilterState,
} from "../boardStatusUtils";
import { buildListColumnTaskIds, type BoardLayoutNav } from "./boardTaskNavigation";

interface UseBoardColumnMapParams {
  board: Board;
  layout: BoardLayoutNav;
  listElementsRef: MutableRefObject<Map<number, HTMLElement>>;
}

interface UseBoardColumnMapResult {
  columnMap: Map<number, number[]>;
  listColumnOrder: number[];
  setListColumnOrder: (ids: number[]) => void;
  resolvePointerListId: () => number | null;
}

export function useBoardColumnMap({
  board,
  layout,
  listElementsRef,
}: UseBoardColumnMapParams): UseBoardColumnMapResult {
  const workflowOrder = useStatusWorkflowOrder();
  const activeGroupIds = useResolvedActiveTaskGroupIds(board.boardId, board.taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.boardId,
    board.taskPriorities,
  );
  const activeReleaseIds = useResolvedActiveReleaseIds(board.boardId, board.releases);
  const dateFilterResolved = useResolvedTaskDateFilter(board.boardId);

  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board, workflowOrder),
    [board, workflowOrder],
  );
  const taskFilter = useMemo<BoardTaskFilterState>(
    () => ({
      // Keyboard navigation should traverse the exact same filtered task set the board renders.
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

  const [listColumnOrder, setListColumnOrderState] = useState<number[]>(() =>
    [...board.lists].sort((a, b) => a.order - b.order).map((list) => list.listId),
  );

  useEffect(() => {
    setListColumnOrderState(
      [...board.lists].sort((a, b) => a.order - b.order).map((list) => list.listId),
    );
  }, [board.boardId, board.lists]);

  const setListColumnOrder = useCallback((ids: number[]) => {
    setListColumnOrderState(ids);
  }, []);

  const tasksByListStatus = useMemo(
    () => buildTasksByListStatusIndex(board.tasks),
    [board.tasks],
  );

  const columnMap = useMemo(
    () =>
      buildListColumnTaskIds(
        layout,
        listColumnOrder,
        taskFilter,
        tasksByListStatus,
      ),
    [layout, listColumnOrder, taskFilter, tasksByListStatus],
  );

  const lastMousePointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      lastMousePointRef.current = { x: event.clientX, y: event.clientY };
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  const resolvePointerListId = useCallback(() => {
    const point = lastMousePointRef.current;
    if (!point) return null;
    for (const listId of listColumnOrder) {
      const el = listElementsRef.current.get(listId);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (point.x >= rect.left && point.x <= rect.right) {
        return listId;
      }
    }
    return null;
  }, [listColumnOrder, listElementsRef]);

  return {
    columnMap,
    listColumnOrder,
    setListColumnOrder,
    resolvePointerListId,
  };
}
