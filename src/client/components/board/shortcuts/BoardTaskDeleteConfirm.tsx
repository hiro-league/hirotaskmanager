import { useDeleteTask } from "@/api/mutations";
import { taskDisplayTitle, type Board } from "../../../../shared/models";
import { useBoardKeyboardNav } from "./BoardKeyboardNavContext";
import { ConfirmDialog } from "./ConfirmDialog";

interface BoardTaskDeleteConfirmProps {
  board: Board;
  taskId: number | null;
  onClose: () => void;
}

/**
 * Board-scoped delete confirmation for the Delete key and flows that share the same scope.
 */
export function BoardTaskDeleteConfirm({
  board,
  taskId,
  onClose,
}: BoardTaskDeleteConfirmProps) {
  const nav = useBoardKeyboardNav();
  const deleteTask = useDeleteTask();
  const open = taskId != null;
  const task =
    taskId != null ? board.tasks.find((t) => t.id === taskId) : undefined;

  return (
    <ConfirmDialog
      open={open}
      scope="task-delete-confirmation"
      title="Delete this task?"
      message={
        task
          ? `Delete “${taskDisplayTitle(task)}”? This cannot be undone.`
          : "Delete this task? This cannot be undone."
      }
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="destructive"
      onCancel={onClose}
      onConfirm={() => {
        if (taskId == null) return;
        deleteTask.mutate(
          { boardId: board.id, taskId },
          {
            onSuccess: () => {
              nav.setHighlightedTaskId(null);
              onClose();
            },
          },
        );
      }}
    />
  );
}
