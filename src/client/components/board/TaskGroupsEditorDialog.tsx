import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  nextGroupId,
  type Board,
  type GroupDefinition,
} from "../../../shared/models";
import { usePatchBoardTaskGroups } from "@/api/mutations";

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
  const patchGroups = usePatchBoardTaskGroups();
  const [rows, setRows] = useState<GroupDefinition[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(
      board.taskGroups.length > 0
        ? board.taskGroups.map((g) => ({ ...g }))
        : [{ id: 0, label: "" }],
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

  const { nextGroups, remapCount } = useMemo(() => {
    const trimmed = rows
      .map((r) => ({ id: r.id, label: r.label.trim() }))
      .filter((r) => r.label.length > 0);
    const nextIds = new Set(trimmed.map((g) => g.id));
    const removed = board.taskGroups
      .filter((g) => !nextIds.has(g.id))
      .map((g) => g.id);
    const count = board.tasks.filter((t) => removed.includes(t.groupId))
      .length;
    return {
      nextGroups: trimmed,
      remapCount: count,
    };
  }, [rows, board.taskGroups, board.tasks]);

  if (!open) return null;

  const busy = patchGroups.isPending;

  const save = () => {
    if (nextGroups.length === 0) return;
    patchGroups.mutate(
      { boardId: board.id, taskGroups: nextGroups },
      { onSuccess: () => onClose() },
    );
  };

  const firstLabel = nextGroups[0]?.label ?? "";

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
        {remapCount > 0 ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            {remapCount} task{remapCount === 1 ? "" : "s"} in removed groups
            will move to &quot;{firstLabel}&quot;.
          </p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2">
              <input
                type="text"
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                value={row.label}
                disabled={busy}
                placeholder="Group name"
                aria-label={`Group ${row.label || row.id}`}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((prev) =>
                    prev.map((x) => (x.id === row.id ? { ...x, label: v } : x)),
                  );
                }}
              />
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                disabled={busy || rows.length <= 1}
                aria-label="Remove group row"
                onClick={() =>
                  setRows((prev) => prev.filter((x) => x.id !== row.id))
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
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { id: nextGroupId(prev), label: "" },
            ])
          }
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
