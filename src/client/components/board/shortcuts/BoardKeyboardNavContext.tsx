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
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskDateFilter,
} from "@/store/preferences";
import {
  visibleStatusesForBoard,
  type BoardTaskFilterState,
} from "../boardStatusUtils";
import {
  buildListColumnTaskIds,
  findFirstTaskId,
  findListIdForTask,
  initialHighlightForFirstList,
  PAGE_STEP,
  type BoardLayoutNav,
} from "./boardTaskNavigation";

const KEYBOARD_SCROLL_MARGIN_PX = 10;

function canScrollAxis(
  el: HTMLElement,
  axis: "x" | "y",
): boolean {
  const style = window.getComputedStyle(el);
  const overflow =
    axis === "y" ? style.overflowY || style.overflow : style.overflowX || style.overflow;
  if (!/(auto|scroll|overlay)/.test(overflow)) return false;
  return axis === "y"
    ? el.scrollHeight > el.clientHeight + 1
    : el.scrollWidth > el.clientWidth + 1;
}

function scrollTaskIntoViewWithMargin(
  el: HTMLElement | null,
  margin = KEYBOARD_SCROLL_MARGIN_PX,
): void {
  if (!el) return;

  // `scrollIntoView({ block: "nearest" })` can leave the selected card's ring or
  // shadow slightly clipped at the edge, so nudge each scroll container with padding.
  let ancestor = el.parentElement;
  while (ancestor) {
    const canScrollY = canScrollAxis(ancestor, "y");
    const canScrollX = canScrollAxis(ancestor, "x");
    if (canScrollY || canScrollX) {
      const ancestorRect = ancestor.getBoundingClientRect();
      const elementRect = el.getBoundingClientRect();

      if (canScrollY) {
        if (elementRect.top < ancestorRect.top + margin) {
          ancestor.scrollTop -= ancestorRect.top + margin - elementRect.top;
        } else if (elementRect.bottom > ancestorRect.bottom - margin) {
          ancestor.scrollTop += elementRect.bottom - (ancestorRect.bottom - margin);
        }
      }

      if (canScrollX) {
        if (elementRect.left < ancestorRect.left + margin) {
          ancestor.scrollLeft -= ancestorRect.left + margin - elementRect.left;
        } else if (elementRect.right > ancestorRect.right - margin) {
          ancestor.scrollLeft += elementRect.right - (ancestorRect.right - margin);
        }
      }
    }
    ancestor = ancestor.parentElement;
  }
}

interface BoardKeyboardNavContextValue {
  highlightedTaskId: number | null;
  /** Clears list highlight when selecting a task. */
  setHighlightedTaskId: (id: number | null) => void;
  /** Semantic helper for user/task interactions that should make a task current. */
  selectTask: (taskId: number | null) => void;
  /** List header selection (mutually exclusive with task highlight). */
  highlightedListId: number | null;
  setHighlightedListId: (id: number | null) => void;
  /** Semantic helper for user/list interactions that should make a list current. */
  selectList: (listId: number | null) => void;
  hoveredTaskId: number | null;
  setHoveredTaskId: (id: number | null) => void;
  /** Pointer hover fallback for Tab when the mouse is over list chrome, not a task. */
  hoveredListId: number | null;
  setHoveredListId: (id: number | null) => void;
  registerTaskElement: (taskId: number, el: HTMLElement | null) => void;
  registerListElement: (listId: number, el: HTMLElement | null) => void;
  /** Open-band task composer per list; last open band wins if remounted. */
  registerAddTaskComposer: (listId: number, open: () => void) => () => void;
  openAddTaskForList: (listId: number) => void;
  /** List header rename (F2); last mounted header for that list wins. */
  registerListRename: (listId: number, openRename: () => void) => () => void;
  openRenameForList: (listId: number) => void;
  /** Opens the board “Add list” composer; new list is ordered after `anchorListId` (null = append at end). */
  registerOpenAddListComposer: (
    fn: (anchorListId: number | null) => void,
  ) => () => void;
  openAddListComposerAfter: (anchorListId: number | null) => void;
  setListColumnOrder: (ids: number[]) => void;
  focusOrScrollHighlight: () => void;
  moveHighlight: (dir: "up" | "down" | "left" | "right") => void;
  highlightHome: () => void;
  highlightEnd: () => void;
  /** Page Up = -1, Page Down = +1 (moves by PAGE_STEP within the column). */
  highlightPage: (direction: -1 | 1) => void;
  /**
   * Apply list/task selection from notification deep links. If the task exists on the board
   * but is not in the filtered column map, returns `task_filtered_out` so the caller can
   * open the task editor instead.
   */
  applyNotificationTarget: (opts: {
    taskId?: number;
    listId?: number;
  }) =>
    | { kind: "task_selected" }
    | { kind: "task_filtered_out"; taskId: number }
    | { kind: "list_selected" }
    | { kind: "noop" };
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
  const activeGroupIds = useResolvedActiveTaskGroupIds(board.id, board.taskGroups);
  const activePriorityIds = useResolvedActiveTaskPriorityIds(
    board.id,
    board.taskPriorities,
  );
  const dateFilterResolved = useResolvedTaskDateFilter(board.id);
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
      dateFilter: dateFilterResolved,
    }),
    [
      visibleStatuses,
      workflowOrder,
      activeGroupIds,
      activePriorityIds,
      dateFilterResolved,
    ],
  );

  const [listColumnOrder, setListColumnOrder] = useState<number[]>(() =>
    [...board.lists].sort((a, b) => a.order - b.order).map((l) => l.id),
  );

  useEffect(() => {
    setListColumnOrder(
      [...board.lists].sort((a, b) => a.order - b.order).map((l) => l.id),
    );
  }, [board.id, board.lists]);

  const [highlightedTaskId, setTaskIdState] = useState<number | null>(null);
  const [highlightedListId, setListIdState] = useState<number | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<number | null>(null);
  const [hoveredListId, setHoveredListId] = useState<number | null>(null);

  const setHighlightedTaskId = useCallback((id: number | null) => {
    setTaskIdState(id);
    if (id != null) setListIdState(null);
  }, []);

  const selectTask = useCallback((taskId: number | null) => {
    // Pointer/edit/create flows should reuse the same highlight state that keyboard
    // navigation already owns, instead of inventing a parallel "selected" model.
    setHighlightedTaskId(taskId);
  }, [setHighlightedTaskId]);

  const setHighlightedListId = useCallback((id: number | null) => {
    setListIdState(id);
    if (id != null) setTaskIdState(null);
  }, []);

  const selectList = useCallback((listId: number | null) => {
    // Keep list interactions on the shared highlight state so canceling an edit
    // or dropping back in place still leaves the last-touched list current.
    setHighlightedListId(listId);
  }, [setHighlightedListId]);

  const columnMap = useMemo(
    () =>
      buildListColumnTaskIds(
        board,
        layout,
        listColumnOrder,
        taskFilter,
      ),
    [
      board,
      layout,
      listColumnOrder,
      taskFilter,
    ],
  );

  const initialHighlightAppliedForBoardId = useRef<number | null>(null);

  useEffect(() => {
    // Clear both highlights without going through wrappers so null task does not leave a stale list id.
    setTaskIdState(null);
    setListIdState(null);
    setHoveredTaskId(null);
    setHoveredListId(null);
    initialHighlightAppliedForBoardId.current = null;
  }, [board.id]);

  useEffect(() => {
    // On board load, select the first task in the leftmost list, or that list’s header if it has no visible tasks.
    // Ref avoids re-applying when filters/group/priority change columnMap for the same board.
    if (initialHighlightAppliedForBoardId.current === board.id) return;
    // Notification deep links apply in a child `useLayoutEffect` before this passive effect; honor that selection
    // so we do not overwrite it when listColumnOrder syncs late or the hash is cleared before this runs.
    if (highlightedTaskId != null || highlightedListId != null) {
      initialHighlightAppliedForBoardId.current = board.id;
      return;
    }
    const hash =
      typeof window !== "undefined" ? window.location.hash : "";
    if (
      hash.length > 1 &&
      (hash.includes("taskId=") || hash.includes("listId="))
    ) {
      initialHighlightAppliedForBoardId.current = board.id;
      return;
    }
    const orderedFromBoard = [...board.lists]
      .sort((a, b) => a.order - b.order)
      .map((l) => l.id);
    // After a board switch, listColumnOrder can lag one frame behind board.lists; wait until they match.
    if (
      orderedFromBoard.length !== listColumnOrder.length ||
      !orderedFromBoard.every((id, i) => listColumnOrder[i] === id)
    ) {
      return;
    }
    const initial = initialHighlightForFirstList(listColumnOrder, columnMap);
    initialHighlightAppliedForBoardId.current = board.id;
    if (initial == null) return;
    if (initial.kind === "task") {
      setHighlightedTaskId(initial.taskId);
    } else {
      setHighlightedListId(initial.listId);
    }
  }, [
    board.id,
    board.lists,
    columnMap,
    highlightedListId,
    highlightedTaskId,
    listColumnOrder,
    setHighlightedListId,
    setHighlightedTaskId,
  ]);

  // Selection stays keyboard-driven; pointer hover only sets a transient target for F.
  useEffect(() => {
    setTaskIdState((prev) => {
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

  useEffect(() => {
    setListIdState((prev) => {
      if (prev == null) return null;
      return listColumnOrder.includes(prev) ? prev : null;
    });
  }, [listColumnOrder]);

  useEffect(() => {
    setHoveredListId((prev) => {
      if (prev == null) return null;
      return listColumnOrder.includes(prev) ? prev : null;
    });
  }, [listColumnOrder]);

  const taskElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const listElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const addTaskComposersRef = useRef<Map<number, () => void>>(new Map());
  const listRenameOpenersRef = useRef<Map<number, () => void>>(new Map());
  const lastMousePointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Remember the latest mouse coordinates so Tab can still resolve a list
    // by column position even when the pointer sits above or below the list shell.
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      lastMousePointRef.current = { x: event.clientX, y: event.clientY };
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  const registerTaskElement = useCallback(
    (taskId: number, el: HTMLElement | null) => {
      if (el) taskElementsRef.current.set(taskId, el);
      else taskElementsRef.current.delete(taskId);
    },
    [],
  );

  const registerListElement = useCallback(
    (listId: number, el: HTMLElement | null) => {
      if (el) listElementsRef.current.set(listId, el);
      else listElementsRef.current.delete(listId);
    },
    [],
  );

  const registerAddTaskComposer = useCallback(
    (listId: number, open: () => void) => {
      addTaskComposersRef.current.set(listId, open);
      return () => {
        addTaskComposersRef.current.delete(listId);
      };
    },
    [],
  );

  const openAddTaskForList = useCallback((listId: number) => {
    addTaskComposersRef.current.get(listId)?.();
  }, []);

  const registerListRename = useCallback(
    (listId: number, openRename: () => void) => {
      listRenameOpenersRef.current.set(listId, openRename);
      return () => {
        listRenameOpenersRef.current.delete(listId);
      };
    },
    [],
  );

  const openRenameForList = useCallback((listId: number) => {
    listRenameOpenersRef.current.get(listId)?.();
  }, []);

  const openAddListComposerRef = useRef<
    ((anchorListId: number | null) => void) | null
  >(null);

  const registerOpenAddListComposer = useCallback(
    (fn: (anchorListId: number | null) => void) => {
      openAddListComposerRef.current = fn;
      return () => {
        openAddListComposerRef.current = null;
      };
    },
    [],
  );

  const openAddListComposerAfter = useCallback(
    (anchorListId: number | null) => {
      openAddListComposerRef.current?.(anchorListId);
    },
    [],
  );

  useEffect(() => {
    if (highlightedTaskId == null) return;
    const el = taskElementsRef.current.get(highlightedTaskId);
    scrollTaskIntoViewWithMargin(el ?? null);
  }, [highlightedTaskId]);

  useEffect(() => {
    if (highlightedListId == null) return;
    const el = listElementsRef.current.get(highlightedListId);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [highlightedListId]);

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
  }, [listColumnOrder]);

  const focusOrScrollHighlight = useCallback(() => {
    const all = [...columnMap.values()].flat();
    if (hoveredTaskId != null && all.includes(hoveredTaskId)) {
      setHighlightedTaskId(hoveredTaskId);
      const hoveredEl = taskElementsRef.current.get(hoveredTaskId);
      scrollTaskIntoViewWithMargin(hoveredEl ?? null);
      return;
    }
    const pointerListId =
      hoveredListId != null && listColumnOrder.includes(hoveredListId)
        ? hoveredListId
        : resolvePointerListId();
    if (pointerListId != null) {
      // Match the user's current mouse column when they are over list chrome or
      // whitespace, instead of skipping straight to the first task on the board.
      setHighlightedListId(pointerListId);
      const pointerListEl = listElementsRef.current.get(pointerListId);
      pointerListEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (highlightedListId != null) {
      const el = listElementsRef.current.get(highlightedListId);
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (highlightedTaskId == null) {
      const first = findFirstTaskId(listColumnOrder, columnMap);
      if (first != null) setHighlightedTaskId(first);
      return;
    }
    const el = taskElementsRef.current.get(highlightedTaskId);
    scrollTaskIntoViewWithMargin(el ?? null);
  }, [
    hoveredTaskId,
    hoveredListId,
    highlightedTaskId,
    highlightedListId,
    listColumnOrder,
    columnMap,
    resolvePointerListId,
    setHighlightedListId,
    setHighlightedTaskId,
  ]);

  const moveHighlight = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      if (highlightedListId != null) {
        const li = listColumnOrder.indexOf(highlightedListId);
        if (li < 0) return;
        if (dir === "down") {
          const colIds = columnMap.get(highlightedListId) ?? [];
          if (colIds.length > 0) setHighlightedTaskId(colIds[0]!);
          return;
        }
        if (dir === "up") return;
        if (dir === "left") {
          if (li <= 0) return;
          setHighlightedListId(listColumnOrder[li - 1]!);
          return;
        }
        if (dir === "right") {
          if (li >= listColumnOrder.length - 1) return;
          setHighlightedListId(listColumnOrder[li + 1]!);
          return;
        }
        return;
      }

      const taskId = highlightedTaskId;
      if (taskId == null) return;

      const listId = findListIdForTask(columnMap, taskId);
      if (listId == null) return;

      const colIds = columnMap.get(listId) ?? [];
      const idx = colIds.indexOf(taskId);
      if (idx < 0) return;

      const li = listColumnOrder.indexOf(listId);

      if (dir === "up") {
        if (idx > 0) setHighlightedTaskId(colIds[idx - 1]!);
        else setHighlightedListId(listId);
        return;
      }
      if (dir === "down") {
        if (idx < colIds.length - 1) {
          setHighlightedTaskId(colIds[idx + 1]!);
          return;
        }
        for (let i = li + 1; i < listColumnOrder.length; i++) {
          const nextLid = listColumnOrder[i]!;
          const nextCol = columnMap.get(nextLid) ?? [];
          if (nextCol.length > 0) {
            setHighlightedTaskId(nextCol[0]!);
            return;
          }
        }
        return;
      }

      if (dir === "left") {
        if (li <= 0) return;
        for (let i = li - 1; i >= 0; i--) {
          const newLid = listColumnOrder[i]!;
          const newCol = columnMap.get(newLid) ?? [];
          if (newCol.length === 0) {
            setHighlightedListId(newLid);
            return;
          }
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
          if (newCol.length === 0) {
            setHighlightedListId(newLid);
            return;
          }
          const ni = Math.min(idx, newCol.length - 1);
          setHighlightedTaskId(newCol[ni]!);
          return;
        }
      }
    },
    [
      highlightedListId,
      highlightedTaskId,
      listColumnOrder,
      columnMap,
      setHighlightedListId,
      setHighlightedTaskId,
    ],
  );

  const highlightHome = useCallback(() => {
    if (highlightedListId != null) return;
    if (highlightedTaskId == null) return;
    const lid = findListIdForTask(columnMap, highlightedTaskId);
    if (lid == null) return;
    const col = columnMap.get(lid) ?? [];
    if (col.length > 0) setHighlightedTaskId(col[0]!);
  }, [highlightedListId, highlightedTaskId, columnMap, setHighlightedTaskId]);

  const highlightEnd = useCallback(() => {
    if (highlightedListId != null) return;
    if (highlightedTaskId == null) return;
    const lid = findListIdForTask(columnMap, highlightedTaskId);
    if (lid == null) return;
    const col = columnMap.get(lid) ?? [];
    if (col.length > 0) setHighlightedTaskId(col[col.length - 1]!);
  }, [highlightedListId, highlightedTaskId, columnMap, setHighlightedTaskId]);

  const highlightPage = useCallback(
    (direction: -1 | 1) => {
      if (highlightedListId != null) return;
      if (highlightedTaskId == null) return;
      const lid = findListIdForTask(columnMap, highlightedTaskId);
      if (lid == null) return;
      const colIds = columnMap.get(lid) ?? [];
      const idx = colIds.indexOf(highlightedTaskId);
      if (idx < 0) return;
      const next = Math.max(
        0,
        Math.min(colIds.length - 1, idx + direction * PAGE_STEP),
      );
      setHighlightedTaskId(colIds[next]!);
    },
    [highlightedListId, highlightedTaskId, columnMap, setHighlightedTaskId],
  );

  const applyNotificationTarget = useCallback(
    (opts: { taskId?: number; listId?: number }):
      | { kind: "task_selected" }
      | { kind: "task_filtered_out"; taskId: number }
      | { kind: "list_selected" }
      | { kind: "noop" } => {
      if (opts.taskId != null) {
        const all = [...columnMap.values()].flat();
        if (all.includes(opts.taskId)) {
          selectTask(opts.taskId);
          return { kind: "task_selected" };
        }
        return { kind: "task_filtered_out", taskId: opts.taskId };
      }
      if (opts.listId != null && listColumnOrder.includes(opts.listId)) {
        selectList(opts.listId);
        return { kind: "list_selected" };
      }
      return { kind: "noop" };
    },
    [columnMap, listColumnOrder, selectTask, selectList],
  );

  const value = useMemo(
    (): BoardKeyboardNavContextValue => ({
      highlightedTaskId,
      setHighlightedTaskId,
      selectTask,
      highlightedListId,
      setHighlightedListId,
      selectList,
      hoveredTaskId,
      setHoveredTaskId,
      hoveredListId,
      setHoveredListId,
      registerTaskElement,
      registerListElement,
      registerAddTaskComposer,
      openAddTaskForList,
      registerListRename,
      openRenameForList,
      registerOpenAddListComposer,
      openAddListComposerAfter,
      setListColumnOrder,
      focusOrScrollHighlight,
      moveHighlight,
      highlightHome,
      highlightEnd,
      highlightPage,
      applyNotificationTarget,
    }),
    [
      highlightedTaskId,
      setHighlightedTaskId,
      selectTask,
      highlightedListId,
      setHighlightedListId,
      selectList,
      hoveredTaskId,
      hoveredListId,
      registerTaskElement,
      registerListElement,
      registerAddTaskComposer,
      openAddTaskForList,
      registerListRename,
      openRenameForList,
      registerOpenAddListComposer,
      openAddListComposerAfter,
      focusOrScrollHighlight,
      moveHighlight,
      highlightHome,
      highlightEnd,
      highlightPage,
      applyNotificationTarget,
    ],
  );

  return (
    <BoardKeyboardNavContext.Provider value={value}>
      {children}
    </BoardKeyboardNavContext.Provider>
  );
}
