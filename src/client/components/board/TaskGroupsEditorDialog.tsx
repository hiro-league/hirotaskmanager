import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Board } from "../../../shared/models";
import { useUpdateBoard } from "@/api/mutations";

interface TaskGroupsEditorDialogProps {
  board: Board;
  open: boolean;
  onClose: () => void;
}

export function TaskGroupsEditorDialog({
  board,
  open,
  onClose,
}: TaskGroupsEditorDialogProps) {
  const titleId = useId();
  const updateBoard = useUpdateBoard();
  const [rows, setRows] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(
      board.taskGroups.length > 0 ? [...board.taskGroups] : [""],
    );
  }, [open, board.taskGroups]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const busy = updateBoard.isPending;

  const save = () => {
    const taskGroups = rows
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (taskGroups.length === 0) return;
    const now = new Date().toISOString();
    updateBoard.mutate(
      {
        ...board,
        taskGroups,
        updatedAt: now,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          Task groups
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Names used to categorize tasks on this board. Empty rows are ignored.
        </p>

        <ul className="mt-4 space-y-2">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="text"
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                value={row}
                disabled={busy}
                placeholder="Group name"
                aria-label={`Group ${i + 1}`}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((prev) => prev.map((x, j) => (j === i ? v : x)));
                }}
              />
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                disabled={busy || rows.length <= 1}
                aria-label="Remove group row"
                onClick={() =>
                  setRows((prev) => prev.filter((_, j) => j !== i))
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          disabled={busy}
          onClick={() => setRows((prev) => [...prev, ""])}
        >
          <Plus className="size-4" aria-hidden />
          Add group
        </button>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={busy}
            onClick={() => save()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
