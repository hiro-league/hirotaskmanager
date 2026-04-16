import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { Board } from "../../../../shared/models";
import type { BoardLayoutNav } from "./boardTaskNavigation";
import { useBoardColumnMap } from "./useBoardColumnMap";
import { useBoardHighlightState } from "./useBoardHighlightState";
import { useTaskRevealRegistry } from "./useTaskRevealRegistry";

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
  /**
   * Pointer hover for “focus under mouse” (F / Tab flows). Stored in refs only so moving
   * the mouse does not invalidate context and re-render the whole board (see board perf plan #1).
   */
  setHoveredTaskId: (id: number | null) => void;
  /** Pointer hover over list chrome when not over a task (Tab column resolution). Ref-backed. */
  setHoveredListId: (id: number | null) => void;
  registerTaskElement: (taskId: number, el: HTMLElement | null) => void;
  /** Virtualized bands use this to reveal offscreen tasks before keyboard scroll/focus runs. */
  registerTaskRevealer: (reveal: (taskId: number) => boolean) => () => void;
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
  const listElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const addTaskComposersRef = useRef<Map<number, () => void>>(new Map());
  const listRenameOpenersRef = useRef<Map<number, () => void>>(new Map());
  const {
    pendingRevealTaskIdRef,
    registerTaskRevealer,
    revealTask,
    clearPendingReveal,
  } = useTaskRevealRegistry();
  const { columnMap, listColumnOrder, setListColumnOrder, resolvePointerListId } =
    useBoardColumnMap({
      board,
      layout,
      listElementsRef,
    });
  const {
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
  } = useBoardHighlightState({
    boardId: board.boardId,
    boardLists: board.lists,
    listColumnOrder,
    columnMap,
    listElementsRef,
    resolvePointerListId,
    pendingRevealTaskIdRef,
    revealTask,
    clearPendingReveal,
  });

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

  // Expose highlight ids as getters so reads always see the latest ref without promoting
  // highlight/hover to React state (would re-render the whole board on every arrow move;
  // see docs/top-10-refactors.md #5 perf safeguards).
  const value = useMemo(
    (): BoardKeyboardNavContextValue => ({
      get highlightedTaskId() {
        return highlightedTaskIdRef.current;
      },
      setHighlightedTaskId,
      selectTask,
      get highlightedListId() {
        return highlightedListIdRef.current;
      },
      setHighlightedListId,
      selectList,
      setHoveredTaskId,
      setHoveredListId,
      registerTaskElement,
      registerTaskRevealer,
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
      setHighlightedTaskId,
      selectTask,
      setHighlightedListId,
      selectList,
      setHoveredTaskId,
      setHoveredListId,
      registerTaskElement,
      registerTaskRevealer,
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
    ],
  );

  return (
    <BoardKeyboardNavContext.Provider value={value}>
      {children}
    </BoardKeyboardNavContext.Provider>
  );
}
