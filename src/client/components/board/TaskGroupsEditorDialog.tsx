import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  nextGroupId,
  type Board,
  type GroupDefinition,
} from "../../../shared/models";
import { usePatchBoardTaskGroups } from "@/api/mutations";
import { DiscardChangesDialog } from "./shortcuts/DiscardChangesDialog";
import { useShortcutOverlay } from "./shortcuts/ShortcutScopeContext";
import { useDialogCloseRequest } from "./shortcuts/useDialogCloseRequest";
import { useModalFocusTrap } from "./shortcuts/useModalFocusTrap";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const patchGroups = usePatchBoardTaskGroups();
  const [rows, setRows] = useState<GroupDefinition[]>([]);
  /** Snapshot when dialog opens — used for dirty detection (Phase 4 close-request path). */
  const [baseline, setBaseline] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowDiscard(false);
    const initial: GroupDefinition[] =
      board.taskGroups.length > 0
        ? board.taskGroups.map((g) => ({ ...g }))
        : [{ id: 0, label: "" }];
    setRows(initial);
    setBaseline(JSON.stringify(initial));
  }, [open, board.taskGroups]);

  const isDirty = useMemo(
    () => open && JSON.stringify(rows) !== baseline,
    [open, rows, baseline],
  );

  const busy = patchGroups.isPending;

  const requestClose = useDialogCloseRequest({
    busy,
    isDirty,
    onClose,
    onDirtyClose: () => setShowDiscard(true),
  });

  const keyHandler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      requestClose();
    },
    [requestClose],
  );

  const taskGroupsEditorActive = open && !showDiscard;
  useShortcutOverlay(taskGroupsEditorActive, "task-groups-editor", keyHandler);
  useModalFocusTrap({
    open,
    active: taskGroupsEditorActive,
    containerRef: dialogRef,
  });

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

  const save = () => {
    if (nextGroups.length === 0) return;
    patchGroups.mutate(
      { boardId: board.id, taskGroups: nextGroups },
      { onSuccess: () => onClose() },
    );
  };

  const firstLabel = nextGroups[0]?.label ?? "";

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={busy ? undefined : requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        // Dialogs opt back into selection so board-wide drag suppression does not block editing text.
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text"
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
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text"
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
            onClick={requestClose}
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

    <DiscardChangesDialog
      open={showDiscard}
      onCancel={() => setShowDiscard(false)}
      onDiscard={() => {
        setShowDiscard(false);
        onClose();
      }}
    />
    </>
  );
}
