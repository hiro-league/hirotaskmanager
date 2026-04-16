import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Board } from "../../../../shared/models";
import {
  findFirstTaskId,
  findListIdForTask,
  initialHighlightForFirstList,
  PAGE_STEP,
} from "./boardTaskNavigation";

const KEYBOARD_SCROLL_MARGIN_PX = 10;
const KEYBOARD_RING_CLASSES = [
  "ring-2",
  "ring-offset-2",
  "ring-offset-background",
  "shadow-md",
] as const;

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

function scrollElementIntoViewWithMargin(
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

type NotificationTargetResult =
  | { kind: "task_selected" }
  | { kind: "task_filtered_out"; taskId: number }
  | { kind: "list_selected" }
  | { kind: "noop" };

interface UseBoardHighlightStateParams {
  boardId: number;
  boardLists: Board["lists"];
  listColumnOrder: number[];
  columnMap: Map<number, number[]>;
  listElementsRef: MutableRefObject<Map<number, HTMLElement>>;
  resolvePointerListId: () => number | null;
  pendingRevealTaskIdRef: MutableRefObject<number | null>;
  revealTask: (taskId: number) => boolean;
  clearPendingReveal: () => void;
}

interface UseBoardHighlightStateResult {
  highlightedTaskIdRef: MutableRefObject<number | null>;
  highlightedListIdRef: MutableRefObject<number | null>;
  setHighlightedTaskId: (id: number | null) => void;
  selectTask: (taskId: number | null) => void;
  setHighlightedListId: (id: number | null) => void;
  selectList: (listId: number | null) => void;
  setHoveredTaskId: (id: number | null) => void;
  setHoveredListId: (id: number | null) => void;
  registerTaskElement: (taskId: number, el: HTMLElement | null) => void;
  registerListElement: (listId: number, el: HTMLElement | null) => void;
  focusOrScrollHighlight: () => void;
  moveHighlight: (dir: "up" | "down" | "left" | "right") => void;
  highlightHome: () => void;
  highlightEnd: () => void;
  highlightPage: (direction: -1 | 1) => void;
  applyNotificationTarget: (opts: {
    taskId?: number;
    listId?: number;
  }) => NotificationTargetResult;
}

export function useBoardHighlightState({
  boardId,
  boardLists,
  listColumnOrder,
  columnMap,
  listElementsRef,
  resolvePointerListId,
  pendingRevealTaskIdRef,
  revealTask,
  clearPendingReveal,
}: UseBoardHighlightStateParams): UseBoardHighlightStateResult {
  const highlightedTaskIdRef = useRef<number | null>(null);
  const highlightedListIdRef = useRef<number | null>(null);
  const hoveredTaskIdRef = useRef<number | null>(null);
  const hoveredListIdRef = useRef<number | null>(null);
  const taskElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const initialHighlightAppliedForBoardId = useRef<number | null>(null);

  useEffect(() => {
    highlightedTaskIdRef.current = null;
    highlightedListIdRef.current = null;
    hoveredTaskIdRef.current = null;
    hoveredListIdRef.current = null;
    clearPendingReveal();
    initialHighlightAppliedForBoardId.current = null;
  }, [boardId, clearPendingReveal]);

  const setKeyboardRing = useCallback((el: HTMLElement | null, active: boolean) => {
    if (!el) return;
    if (active) {
      el.classList.add(...KEYBOARD_RING_CLASSES);
      el.style.setProperty("--tw-ring-color", "var(--board-selection-ring)");
      return;
    }
    el.classList.remove(...KEYBOARD_RING_CLASSES);
    el.style.removeProperty("--tw-ring-color");
  }, []);

  const resolveTaskHighlightTarget = useCallback((el: HTMLElement | null) => {
    if (!el) return null;
    if (el.matches("[data-task-card-root]")) return el;
    return el.querySelector<HTMLElement>("[data-task-card-root]");
  }, []);

  const syncTaskHighlightVisual = useCallback(
    (taskId: number, active: boolean) => {
      const el = taskElementsRef.current.get(taskId) ?? null;
      setKeyboardRing(resolveTaskHighlightTarget(el) ?? null, active);
    },
    [resolveTaskHighlightTarget, setKeyboardRing],
  );

  const syncListHighlightVisual = useCallback(
    (listId: number, active: boolean) => {
      setKeyboardRing(listElementsRef.current.get(listId) ?? null, active);
    },
    [listElementsRef, setKeyboardRing],
  );

  const registerTaskElement = useCallback(
    (taskId: number, el: HTMLElement | null) => {
      if (el) {
        taskElementsRef.current.set(taskId, el);
        if (highlightedTaskIdRef.current === taskId) {
          syncTaskHighlightVisual(taskId, true);
        }
        if (pendingRevealTaskIdRef.current === taskId) {
          clearPendingReveal();
          scrollElementIntoViewWithMargin(el);
        }
      } else {
        taskElementsRef.current.delete(taskId);
      }
    },
    [clearPendingReveal, pendingRevealTaskIdRef, syncTaskHighlightVisual],
  );

  const scrollTaskHighlightIntoView = useCallback(
    (taskId: number | null) => {
      if (taskId == null) {
        clearPendingReveal();
        return;
      }
      const el = taskElementsRef.current.get(taskId);
      if (el) {
        clearPendingReveal();
        scrollElementIntoViewWithMargin(el);
        return;
      }
      // Keyboard navigation keeps the logical task highlight even when the row is
      // not mounted; ask the owning virtualizer to bring it into view first.
      revealTask(taskId);
    },
    [clearPendingReveal, revealTask],
  );

  const scrollListHighlightIntoView = useCallback(
    (listId: number | null) => {
      if (listId == null) return;
      scrollElementIntoViewWithMargin(listElementsRef.current.get(listId) ?? null);
    },
    [listElementsRef],
  );

  const setHighlightedTaskId = useCallback(
    (id: number | null) => {
      const prevTaskId = highlightedTaskIdRef.current;
      const prevListId = highlightedListIdRef.current;
      if (prevTaskId === id && prevListId == null) {
        scrollTaskHighlightIntoView(id);
        return;
      }
      if (prevTaskId != null && prevTaskId !== id) {
        syncTaskHighlightVisual(prevTaskId, false);
      }
      if (prevListId != null) {
        syncListHighlightVisual(prevListId, false);
      }
      highlightedTaskIdRef.current = id;
      highlightedListIdRef.current = null;
      if (id == null) {
        clearPendingReveal();
        return;
      }
      syncTaskHighlightVisual(id, true);
      scrollTaskHighlightIntoView(id);
    },
    [
      clearPendingReveal,
      scrollTaskHighlightIntoView,
      syncListHighlightVisual,
      syncTaskHighlightVisual,
    ],
  );

  const selectTask = useCallback((taskId: number | null) => {
    // Pointer/edit/create flows should reuse the same highlight state that keyboard
    // navigation already owns, instead of inventing a parallel "selected" model.
    setHighlightedTaskId(taskId);
  }, [setHighlightedTaskId]);

  const setHighlightedListId = useCallback(
    (id: number | null) => {
      const prevTaskId = highlightedTaskIdRef.current;
      const prevListId = highlightedListIdRef.current;
      if (prevListId === id && prevTaskId == null) {
        scrollListHighlightIntoView(id);
        return;
      }
      if (prevTaskId != null) {
        syncTaskHighlightVisual(prevTaskId, false);
      }
      if (prevListId != null && prevListId !== id) {
        syncListHighlightVisual(prevListId, false);
      }
      highlightedTaskIdRef.current = null;
      highlightedListIdRef.current = id;
      clearPendingReveal();
      if (id == null) return;
      syncListHighlightVisual(id, true);
      scrollListHighlightIntoView(id);
    },
    [
      clearPendingReveal,
      scrollListHighlightIntoView,
      syncListHighlightVisual,
      syncTaskHighlightVisual,
    ],
  );

  const selectList = useCallback((listId: number | null) => {
    // Keep list interactions on the shared highlight state so canceling an edit
    // or dropping back in place still leaves the last-touched list current.
    setHighlightedListId(listId);
  }, [setHighlightedListId]);

  const setHoveredTaskId = useCallback((id: number | null) => {
    hoveredTaskIdRef.current = id;
  }, []);

  const setHoveredListId = useCallback((id: number | null) => {
    hoveredListIdRef.current = id;
  }, []);

  useEffect(() => {
    if (initialHighlightAppliedForBoardId.current === boardId) return;
    if (
      highlightedTaskIdRef.current != null ||
      highlightedListIdRef.current != null
    ) {
      initialHighlightAppliedForBoardId.current = boardId;
      return;
    }
    const hash =
      typeof window !== "undefined" ? window.location.hash : "";
    if (
      hash.length > 1 &&
      (hash.includes("taskId=") || hash.includes("listId="))
    ) {
      initialHighlightAppliedForBoardId.current = boardId;
      return;
    }
    const orderedFromBoard = [...boardLists]
      .sort((a, b) => a.order - b.order)
      .map((list) => list.listId);
    if (
      orderedFromBoard.length !== listColumnOrder.length ||
      !orderedFromBoard.every((id, index) => listColumnOrder[index] === id)
    ) {
      return;
    }
    const initial = initialHighlightForFirstList(listColumnOrder, columnMap);
    initialHighlightAppliedForBoardId.current = boardId;
    if (initial == null) return;
    if (initial.kind === "task") {
      setHighlightedTaskId(initial.taskId);
      return;
    }
    setHighlightedListId(initial.listId);
  }, [
    boardId,
    boardLists,
    columnMap,
    listColumnOrder,
    setHighlightedListId,
    setHighlightedTaskId,
  ]);

  useEffect(() => {
    const all = [...columnMap.values()].flat();
    const highlightedTaskId = highlightedTaskIdRef.current;
    if (highlightedTaskId != null && !all.includes(highlightedTaskId)) {
      setHighlightedTaskId(null);
    }
    const hoveredTaskId = hoveredTaskIdRef.current;
    if (hoveredTaskId != null && !all.includes(hoveredTaskId)) {
      hoveredTaskIdRef.current = null;
    }
  }, [columnMap, setHighlightedTaskId]);

  useEffect(() => {
    const highlightedListId = highlightedListIdRef.current;
    if (highlightedListId != null && !listColumnOrder.includes(highlightedListId)) {
      setHighlightedListId(null);
    }
    const hoveredListId = hoveredListIdRef.current;
    if (hoveredListId != null && !listColumnOrder.includes(hoveredListId)) {
      hoveredListIdRef.current = null;
    }
  }, [listColumnOrder, setHighlightedListId]);

  const registerListElement = useCallback(
    (listId: number, el: HTMLElement | null) => {
      if (el) {
        listElementsRef.current.set(listId, el);
        if (highlightedListIdRef.current === listId) {
          syncListHighlightVisual(listId, true);
        }
      } else {
        listElementsRef.current.delete(listId);
      }
    },
    [listElementsRef, syncListHighlightVisual],
  );

  const focusOrScrollHighlight = useCallback(() => {
    const all = [...columnMap.values()].flat();
    const hoveredTaskId = hoveredTaskIdRef.current;
    if (hoveredTaskId != null && all.includes(hoveredTaskId)) {
      setHighlightedTaskId(hoveredTaskId);
      return;
    }
    const hoveredListId = hoveredListIdRef.current;
    const pointerListId =
      hoveredListId != null && listColumnOrder.includes(hoveredListId)
        ? hoveredListId
        : resolvePointerListId();
    if (pointerListId != null) {
      setHighlightedListId(pointerListId);
      return;
    }
    const highlightedListId = highlightedListIdRef.current;
    if (highlightedListId != null) {
      scrollListHighlightIntoView(highlightedListId);
      return;
    }
    const highlightedTaskId = highlightedTaskIdRef.current;
    if (highlightedTaskId == null) {
      const first = findFirstTaskId(listColumnOrder, columnMap);
      if (first != null) setHighlightedTaskId(first);
      return;
    }
    scrollTaskHighlightIntoView(highlightedTaskId);
  }, [
    columnMap,
    listColumnOrder,
    resolvePointerListId,
    scrollListHighlightIntoView,
    scrollTaskHighlightIntoView,
    setHighlightedListId,
    setHighlightedTaskId,
  ]);

  const moveHighlight = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      const highlightedListId = highlightedListIdRef.current;
      if (highlightedListId != null) {
        const listIndex = listColumnOrder.indexOf(highlightedListId);
        if (listIndex < 0) return;
        if (dir === "down") {
          const columnTaskIds = columnMap.get(highlightedListId) ?? [];
          if (columnTaskIds.length > 0) setHighlightedTaskId(columnTaskIds[0]!);
          return;
        }
        if (dir === "up") return;
        if (dir === "left") {
          if (listIndex <= 0) return;
          setHighlightedListId(listColumnOrder[listIndex - 1]!);
          return;
        }
        if (dir === "right") {
          if (listIndex >= listColumnOrder.length - 1) return;
          setHighlightedListId(listColumnOrder[listIndex + 1]!);
        }
        return;
      }

      const taskId = highlightedTaskIdRef.current;
      if (taskId == null) return;

      const listId = findListIdForTask(columnMap, taskId);
      if (listId == null) return;

      const columnTaskIds = columnMap.get(listId) ?? [];
      const taskIndex = columnTaskIds.indexOf(taskId);
      if (taskIndex < 0) return;

      const listIndex = listColumnOrder.indexOf(listId);

      if (dir === "up") {
        if (taskIndex > 0) setHighlightedTaskId(columnTaskIds[taskIndex - 1]!);
        else setHighlightedListId(listId);
        return;
      }
      if (dir === "down") {
        if (taskIndex < columnTaskIds.length - 1) {
          setHighlightedTaskId(columnTaskIds[taskIndex + 1]!);
          return;
        }
        for (let index = listIndex + 1; index < listColumnOrder.length; index++) {
          const nextListId = listColumnOrder[index]!;
          const nextColumnTaskIds = columnMap.get(nextListId) ?? [];
          if (nextColumnTaskIds.length > 0) {
            setHighlightedTaskId(nextColumnTaskIds[0]!);
            return;
          }
        }
        return;
      }

      if (dir === "left") {
        if (listIndex <= 0) return;
        for (let index = listIndex - 1; index >= 0; index--) {
          const nextListId = listColumnOrder[index]!;
          const nextColumnTaskIds = columnMap.get(nextListId) ?? [];
          if (nextColumnTaskIds.length === 0) {
            setHighlightedListId(nextListId);
            return;
          }
          const nextTaskIndex = Math.min(taskIndex, nextColumnTaskIds.length - 1);
          setHighlightedTaskId(nextColumnTaskIds[nextTaskIndex]!);
          return;
        }
        return;
      }
      if (dir === "right") {
        if (listIndex >= listColumnOrder.length - 1) return;
        for (let index = listIndex + 1; index < listColumnOrder.length; index++) {
          const nextListId = listColumnOrder[index]!;
          const nextColumnTaskIds = columnMap.get(nextListId) ?? [];
          if (nextColumnTaskIds.length === 0) {
            setHighlightedListId(nextListId);
            return;
          }
          const nextTaskIndex = Math.min(taskIndex, nextColumnTaskIds.length - 1);
          setHighlightedTaskId(nextColumnTaskIds[nextTaskIndex]!);
          return;
        }
      }
    },
    [columnMap, listColumnOrder, setHighlightedListId, setHighlightedTaskId],
  );

  const highlightHome = useCallback(() => {
    if (highlightedListIdRef.current != null) return;
    const highlightedTaskId = highlightedTaskIdRef.current;
    if (highlightedTaskId == null) return;
    const listId = findListIdForTask(columnMap, highlightedTaskId);
    if (listId == null) return;
    const columnTaskIds = columnMap.get(listId) ?? [];
    if (columnTaskIds.length > 0) setHighlightedTaskId(columnTaskIds[0]!);
  }, [columnMap, setHighlightedTaskId]);

  const highlightEnd = useCallback(() => {
    if (highlightedListIdRef.current != null) return;
    const highlightedTaskId = highlightedTaskIdRef.current;
    if (highlightedTaskId == null) return;
    const listId = findListIdForTask(columnMap, highlightedTaskId);
    if (listId == null) return;
    const columnTaskIds = columnMap.get(listId) ?? [];
    if (columnTaskIds.length > 0) {
      setHighlightedTaskId(columnTaskIds[columnTaskIds.length - 1]!);
    }
  }, [columnMap, setHighlightedTaskId]);

  const highlightPage = useCallback(
    (direction: -1 | 1) => {
      if (highlightedListIdRef.current != null) return;
      const highlightedTaskId = highlightedTaskIdRef.current;
      if (highlightedTaskId == null) return;
      const listId = findListIdForTask(columnMap, highlightedTaskId);
      if (listId == null) return;
      const columnTaskIds = columnMap.get(listId) ?? [];
      const taskIndex = columnTaskIds.indexOf(highlightedTaskId);
      if (taskIndex < 0) return;
      const nextIndex = Math.max(
        0,
        Math.min(columnTaskIds.length - 1, taskIndex + direction * PAGE_STEP),
      );
      setHighlightedTaskId(columnTaskIds[nextIndex]!);
    },
    [columnMap, setHighlightedTaskId],
  );

  const applyNotificationTarget = useCallback(
    (opts: { taskId?: number; listId?: number }): NotificationTargetResult => {
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
    [columnMap, listColumnOrder, selectList, selectTask],
  );

  return {
    highlightedTaskIdRef,
    highlightedListIdRef,
    setHighlightedTaskId,
    selectTask,
    setHighlightedListId,
    selectList,
    setHoveredTaskId,
    setHoveredListId,
    registerTaskElement,
    registerListElement,
    focusOrScrollHighlight,
    moveHighlight,
    highlightHome,
    highlightEnd,
    highlightPage,
    applyNotificationTarget,
  };
}
