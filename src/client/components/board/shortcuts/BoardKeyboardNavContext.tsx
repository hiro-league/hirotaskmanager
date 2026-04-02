import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Board } from "../../../../shared/models";
import { useStatusWorkflowOrder } from "@/api/queries";
import {
  useResolvedActiveTaskGroup,
  useResolvedActiveTaskPriorityIds,
} from "@/store/preferences";
import { visibleStatusesForBoard } from "../boardStatusUtils";
import {
  buildListColumnTaskIds,
  findFirstTaskId,
  findListIdForTask,
  PAGE_STEP,
  type BoardLayoutNav,
} from "./boardTaskNavigation";

interface BoardKeyboardNavContextValue {
  highlightedTaskId: number | null;
  setHighlightedTaskId: (id: number | null) => void;
  hoveredTaskId: number | null;
  setHoveredTaskId: (id: number | null) => void;
  registerTaskElement: (taskId: number, el: HTMLElement | null) => void;
  setListColumnOrder: (ids: number[]) => void;
  focusOrScrollHighlight: () => void;
  moveHighlight: (dir: "up" | "down" | "left" | "right") => void;
  highlightHome: () => void;
  highlightEnd: () => void;
  /** Page Up = -1, Page Down = +1 (moves by PAGE_STEP within the column). */
  highlightPage: (direction: -1 | 1) => void;
}

const BoardKeyboardNavContext =
  createContext<BoardKeyboardNavContextValue | null>(null);

export function useBoardKeyboardNav(): BoardKeyboardNavContextValue {
  const ctx = useContext(BoardKeyboardNavContext);
  if (!ctx) {
    throw new Error("useBoardKeyboardNav must be used within BoardKeyboardNavProvider");
  }
  return ctx;
}

export function useBoardKeyboardNavOptional(): BoardKeyboardNavContextValue | null {
  return useContext(BoardKeyboardNavContext);
}

interface ProviderProps {
  board: Board;
  layout: BoardLayoutNav;
  children: ReactNode;
}

export function BoardKeyboardNavProvider({
  board,
  layout,
  children,
}: ProviderProps) {
  const workflowOrder = useStatusWorkflowOrder();
  const activeGroup = useResolvedActiveTaskGroup(board.id, board.taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.id,
    board.taskPriorities,
  );
  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board, workflowOrder),
    [board, workflowOrder],
  );

  const [listColumnOrder, setListColumnOrder] = useState<number[]>(() =>
    [...board.lists].sort((a, b) => a.order - b.order).map((l) => l.id),
  );

  useEffect(() => {
    setListColumnOrder(
      [...board.lists].sort((a, b) => a.order - b.order).map((l) => l.id),
    );
  }, [board.id, board.lists]);

  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(
    null,
  );
  const [hoveredTaskId, setHoveredTaskId] = useState<number | null>(null);

  const columnMap = useMemo(
    () =>
      buildListColumnTaskIds(
        board,
        layout,
        listColumnOrder,
        visibleStatuses,
        workflowOrder,
        activeGroup,
        activePriorityIds,
      ),
    [
      board,
      layout,
      listColumnOrder,
      visibleStatuses,
      workflowOrder,
      activeGroup,
      activePriorityIds,
    ],
  );

  useEffect(() => {
    setHighlightedTaskId(null);
    setHoveredTaskId(null);
  }, [board.id]);

  // Selection stays keyboard-driven; pointer hover only sets a transient target for F.
  useEffect(() => {
    setHighlightedTaskId((prev) => {
      if (prev == null) return null;
      const all = [...columnMap.values()].flat();
      return all.includes(prev) ? prev : null;
    });
    setHoveredTaskId((prev) => {
      if (prev == null) return null;
      const all = [...columnMap.values()].flat();
      return all.includes(prev) ? prev : null;
    });
  }, [listColumnOrder, columnMap]);

  const taskElementsRef = useRef<Map<number, HTMLElement>>(new Map());

  const registerTaskElement = useCallback(
    (taskId: number, el: HTMLElement | null) => {
      if (el) taskElementsRef.current.set(taskId, el);
      else taskElementsRef.current.delete(taskId);
    },
    [],
  );

  useEffect(() => {
    if (highlightedTaskId == null) return;
    const el = taskElementsRef.current.get(highlightedTaskId);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [highlightedTaskId]);

  const focusOrScrollHighlight = useCallback(() => {
    const all = [...columnMap.values()].flat();
    // When the pointer is above a task, F should select that task instead of
    // jumping to the first task or reusing the previous keyboard selection.
    if (hoveredTaskId != null && all.includes(hoveredTaskId)) {
      setHighlightedTaskId(hoveredTaskId);
      const hoveredEl = taskElementsRef.current.get(hoveredTaskId);
      hoveredEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (highlightedTaskId == null) {
      const first = findFirstTaskId(listColumnOrder, columnMap);
      if (first != null) setHighlightedTaskId(first);
      return;
    }
    const el = taskElementsRef.current.get(highlightedTaskId);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [hoveredTaskId, highlightedTaskId, listColumnOrder, columnMap]);

  const moveHighlight = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      const taskId = highlightedTaskId;
      if (taskId == null) return;

      const listId = findListIdForTask(columnMap, taskId);
      if (listId == null) return;

      const colIds = columnMap.get(listId) ?? [];
      const idx = colIds.indexOf(taskId);
      if (idx < 0) return;

      if (dir === "up") {
        if (idx > 0) setHighlightedTaskId(colIds[idx - 1]!);
        return;
      }
      if (dir === "down") {
        if (idx < colIds.length - 1) setHighlightedTaskId(colIds[idx + 1]!);
        return;
      }

      const li = listColumnOrder.indexOf(listId);
      if (dir === "left") {
        if (li <= 0) return;
        for (let i = li - 1; i >= 0; i--) {
          const newLid = listColumnOrder[i]!;
          const newCol = columnMap.get(newLid) ?? [];
          if (newCol.length === 0) continue;
          const ni = Math.min(idx, newCol.length - 1);
          setHighlightedTaskId(newCol[ni]!);
          return;
        }
        return;
      }
      if (dir === "right") {
        if (li >= listColumnOrder.length - 1) return;
        for (let i = li + 1; i < listColumnOrder.length; i++) {
          const newLid = listColumnOrder[i]!;
          const newCol = columnMap.get(newLid) ?? [];
          if (newCol.length === 0) continue;
          const ni = Math.min(idx, newCol.length - 1);
          setHighlightedTaskId(newCol[ni]!);
          return;
        }
      }
    },
    [highlightedTaskId, listColumnOrder, columnMap],
  );

  const highlightHome = useCallback(() => {
    if (highlightedTaskId == null) return;
    const listId = findListIdForTask(columnMap, highlightedTaskId);
    if (listId == null) return;
    const col = columnMap.get(listId) ?? [];
    if (col.length > 0) setHighlightedTaskId(col[0]!);
  }, [highlightedTaskId, listColumnOrder, columnMap]);

  const highlightEnd = useCallback(() => {
    if (highlightedTaskId == null) return;
    const listId = findListIdForTask(columnMap, highlightedTaskId);
    if (listId == null) return;
    const col = columnMap.get(listId) ?? [];
    if (col.length > 0) setHighlightedTaskId(col[col.length - 1]!);
  }, [highlightedTaskId, listColumnOrder, columnMap]);

  const highlightPage = useCallback(
    (direction: -1 | 1) => {
      if (highlightedTaskId == null) return;
      const listId = findListIdForTask(columnMap, highlightedTaskId);
      if (listId == null) return;
      const colIds = columnMap.get(listId) ?? [];
      const idx = colIds.indexOf(highlightedTaskId);
      if (idx < 0) return;
      const next = Math.max(
        0,
        Math.min(colIds.length - 1, idx + direction * PAGE_STEP),
      );
      setHighlightedTaskId(colIds[next]!);
    },
    [highlightedTaskId, listColumnOrder, columnMap],
  );

  const value = useMemo(
    (): BoardKeyboardNavContextValue => ({
      highlightedTaskId,
      setHighlightedTaskId,
      hoveredTaskId,
      setHoveredTaskId,
      registerTaskElement,
      setListColumnOrder,
      focusOrScrollHighlight,
      moveHighlight,
      highlightHome,
      highlightEnd,
      highlightPage,
    }),
    [
      highlightedTaskId,
      hoveredTaskId,
      registerTaskElement,
      focusOrScrollHighlight,
      moveHighlight,
      highlightHome,
      highlightEnd,
      highlightPage,
    ],
  );

  return (
    <BoardKeyboardNavContext.Provider value={value}>
      {children}
    </BoardKeyboardNavContext.Provider>
  );
}
