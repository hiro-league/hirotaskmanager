import { useCallback } from "react";
import {
  useDeleteBoard,
  useDeleteList,
  useDeleteTask,
  useRestoreBoard,
  useRestoreList,
  useRestoreTask,
} from "@/api/mutations";
import { appNavigate } from "@/lib/appNavigate";
import { boardPath } from "@/lib/boardPath";
import { reportMutationError } from "@/lib/mutationErrorUi";
import { useNotificationUiStore } from "@/store/notificationUi";

/**
 * Side-effects callers may want to perform after the entity has been moved to
 * Trash (e.g. clearing a keyboard-nav highlight, closing an editor). Errors
 * during the trash mutation never invoke these.
 */
export interface TrashWithUndoCallbacks {
  onTrashed?: () => void;
}

function pushTrashedToast(args: {
  message: string;
  onUndo: () => void;
}): void {
  useNotificationUiStore.getState().pushSystemToast({
    message: args.message,
    trashLink: true,
    onUndo: args.onUndo,
  });
}

/**
 * Move a board to Trash and surface an "Undo" / "Open Trash" toast (#31351 pattern).
 * Restoring jumps back to the board so a user that navigated away after the delete
 * lands on the freshly-restored board.
 */
export function useTrashBoardWithUndo() {
  const deleteBoard = useDeleteBoard();
  const restoreBoard = useRestoreBoard();
  return useCallback(
    (
      input: { boardId: number; label: string },
      cb?: TrashWithUndoCallbacks,
    ) => {
      const { boardId, label } = input;
      const display = label.trim() || "Board";
      deleteBoard.mutate(boardId, {
        onSuccess: () => {
          cb?.onTrashed?.();
          pushTrashedToast({
            message: `“${display}” moved to Trash.`,
            onUndo: () => {
              restoreBoard.mutate(boardId, {
                onSuccess: () => {
                  appNavigate(boardPath(boardId));
                },
                onError: (err) => reportMutationError("restore board", err),
              });
            },
          });
        },
        onError: (err) => reportMutationError("delete board", err),
      });
    },
    [deleteBoard, restoreBoard],
  );
}

/** Move a list to Trash with an "Undo" / "Open Trash" toast (mirror of board flow). */
export function useTrashListWithUndo() {
  const deleteList = useDeleteList();
  const restoreList = useRestoreList();
  return useCallback(
    (
      input: { boardId: number; listId: number; label: string },
      cb?: TrashWithUndoCallbacks,
    ) => {
      const { boardId, listId, label } = input;
      const display = label.trim() || "List";
      deleteList.mutate(
        { boardId, listId },
        {
          onSuccess: () => {
            cb?.onTrashed?.();
            pushTrashedToast({
              message: `List “${display}” moved to Trash.`,
              onUndo: () => {
                restoreList.mutate(listId, {
                  onError: (err) => reportMutationError("restore list", err),
                });
              },
            });
          },
          onError: (err) => reportMutationError("delete list", err),
        },
      );
    },
    [deleteList, restoreList],
  );
}

/** Move a task to Trash with an "Undo" / "Open Trash" toast (mirror of board flow). */
export function useTrashTaskWithUndo() {
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();
  return useCallback(
    (
      input: { boardId: number; taskId: number; label: string },
      cb?: TrashWithUndoCallbacks,
    ) => {
      const { boardId, taskId, label } = input;
      const display = label.trim() || "Task";
      deleteTask.mutate(
        { boardId, taskId },
        {
          onSuccess: () => {
            cb?.onTrashed?.();
            pushTrashedToast({
              message: `Task “${display}” moved to Trash.`,
              onUndo: () => {
                restoreTask.mutate(taskId, {
                  onError: (err) => reportMutationError("restore task", err),
                });
              },
            });
          },
          onError: (err) => reportMutationError("delete task", err),
        },
      );
    },
    [deleteTask, restoreTask],
  );
}
