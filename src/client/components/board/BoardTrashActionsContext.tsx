import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  listDisplayName,
  taskDisplayTitle,
  type Board,
} from "../../../shared/models";
import {
  useTrashListWithUndo,
  useTrashTaskWithUndo,
  type TrashWithUndoCallbacks,
} from "@/lib/trashWithUndo";

/**
 * Owns the list/task trash mutations at the board level so per-call mutation callbacks fire even
 * after the calling card/header unmounts. The list/task delete mutations remove the entity from
 * the board cache in `onMutate`, which unmounts `ListHeader` / `TaskCardOverflowMenu` before the
 * API call resolves. React Query v5 drops per-`mutate(...)` callbacks once the owning observer
 * unmounts, which is why an inline `useTrashListWithUndo` inside those components silently lost
 * its toast push. Hosting the hooks here (BoardView is stable across these deletes) keeps the
 * observer alive, and consumers just dispatch.
 */
interface BoardTrashActionsValue {
  requestTrashList: (
    listId: number,
    callbacks?: TrashWithUndoCallbacks,
  ) => void;
  requestTrashTask: (
    taskId: number,
    callbacks?: TrashWithUndoCallbacks,
  ) => void;
}

const BoardTrashActionsContext = createContext<BoardTrashActionsValue | null>(
  null,
);

export interface BoardTrashActionsProviderProps {
  boardId: number;
  lists: Board["lists"];
  tasks: Board["tasks"];
  children: ReactNode;
}

export function BoardTrashActionsProvider({
  boardId,
  lists,
  tasks,
  children,
}: BoardTrashActionsProviderProps) {
  const trashListWithUndo = useTrashListWithUndo();
  const trashTaskWithUndo = useTrashTaskWithUndo();

  // Refs read at trash time so labels reflect the current snapshot (rename → delete shows the
  // new name) without rebuilding the callback every render.
  const listsRef = useRef(lists);
  const tasksRef = useRef(tasks);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const requestTrashList = useCallback(
    (listId: number, callbacks?: TrashWithUndoCallbacks) => {
      const list = listsRef.current.find((l) => l.listId === listId);
      if (!list) return;
      trashListWithUndo(
        { boardId, listId, label: listDisplayName(list) },
        callbacks,
      );
    },
    [boardId, trashListWithUndo],
  );

  const requestTrashTask = useCallback(
    (taskId: number, callbacks?: TrashWithUndoCallbacks) => {
      const task = tasksRef.current.find((t) => t.taskId === taskId);
      if (!task) return;
      trashTaskWithUndo(
        { boardId, taskId, label: taskDisplayTitle(task) },
        callbacks,
      );
    },
    [boardId, trashTaskWithUndo],
  );

  const value = useMemo<BoardTrashActionsValue>(
    () => ({ requestTrashList, requestTrashTask }),
    [requestTrashList, requestTrashTask],
  );

  return (
    <BoardTrashActionsContext.Provider value={value}>
      {children}
    </BoardTrashActionsContext.Provider>
  );
}

export function useBoardTrashActions(): BoardTrashActionsValue {
  const ctx = use(BoardTrashActionsContext);
  if (!ctx) {
    throw new Error(
      "useBoardTrashActions must be used inside a <BoardTrashActionsProvider>",
    );
  }
  return ctx;
}
