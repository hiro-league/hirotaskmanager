import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  sortPrioritiesByValue,
  type Board,
  type TaskPriorityDefinition,
} from "../../../../shared/models";
import { isValidHexColor } from "../../../../shared/hexColor";
import { usePatchBoardTaskPriorities } from "@/api/mutations";
import { reportMutationError } from "@/lib/mutationErrorUi";
import { cn } from "@/lib/utils";
import { DiscardChangesDialog } from "../shortcuts/DiscardChangesDialog";
import { useShortcutOverlay } from "../shortcuts/ShortcutScopeContext";
import { useBackdropDismissClick } from "../shortcuts/useBackdropDismissClick";
import { useDialogCloseRequest } from "../shortcuts/useDialogCloseRequest";
import { useBodyScrollLock } from "../shortcuts/bodyScrollLock";
import {
  MODAL_BACKDROP_SURFACE_CLASS,
  MODAL_DIALOG_OVERSCROLL_CLASS,
  MODAL_TEXT_FIELD_CURSOR_CLASS,
} from "../shortcuts/modalOverlayClasses";
import { useModalFocusTrap } from "../shortcuts/useModalFocusTrap";

interface TaskPrioritiesEditorDialogProps {
  board: Board;
  open: boolean;
  onClose: () => void;
}

interface PriorityRow extends TaskPriorityDefinition {
  taskCount: number;
}

function nextPriorityValue(rows: TaskPriorityDefinition[]): number {
  const max = rows.reduce(
    (currentMax, row) =>
      Number.isFinite(row.value) ? Math.max(currentMax, row.value) : currentMax,
    0,
  );
  return max + 10;
}

function nextLocalPriorityId(rows: TaskPriorityDefinition[]): number {
  const min = rows.reduce(
    (currentMin, row) => Math.min(currentMin, row.priorityId),
    0,
  );
  return min <= 0 ? min - 1 : -1;
}

export function TaskPrioritiesEditorDialog({
  board,
  open,
  onClose,
}: TaskPrioritiesEditorDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const patchPriorities = usePatchBoardTaskPriorities();
  const [rows, setRows] = useState<PriorityRow[]>([]);
  const [baseline, setBaseline] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowDiscard(false);
    // Include task counts in the editable rows so delete warnings stay visible
    // while the user renames or recolors priorities.
    const initial = sortPrioritiesByValue(board.taskPriorities).map((priority) => ({
      ...priority,
      taskCount: board.tasks.filter((task) => task.priorityId === priority.priorityId).length,
    }));
    setRows(initial);
    setBaseline(JSON.stringify(initial));
  }, [open, board.taskPriorities, board.tasks]);

  const isDirty = useMemo(
    () => open && JSON.stringify(rows) !== baseline,
    [open, rows, baseline],
  );

  const busy = patchPriorities.isPending;

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

  const taskPrioritiesEditorActive = open && !showDiscard;
  useShortcutOverlay(taskPrioritiesEditorActive, "task-priorities-editor", keyHandler);
  useModalFocusTrap({
    open,
    active: taskPrioritiesEditorActive,
    containerRef: dialogRef,
  });

  const backdropDismiss = useBackdropDismissClick(requestClose, { disabled: busy });

  useBodyScrollLock(open);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const nonEmptyRows = rows.filter(
      (row) => row.label.trim() || row.color.trim() || Number.isFinite(row.value),
    );
    if (nonEmptyRows.length === 0) {
      errors.push("At least one priority is required.");
      return errors;
    }

    const valueSet = new Set<number>();
    for (const row of rows) {
      if (!Number.isInteger(row.value)) {
        errors.push("Priority values must be whole numbers.");
        break;
      }
      if (!row.label.trim()) {
        errors.push("Every priority needs a name.");
        break;
      }
      if (!isValidHexColor(row.color)) {
        errors.push("Every priority needs a valid hex color like #3b82f6.");
        break;
      }
      if (valueSet.has(row.value)) {
        errors.push("Priority numbers must be unique.");
        break;
      }
      valueSet.add(row.value);
    }

    for (const priority of board.taskPriorities) {
      if (!priority.isSystem) continue;
      const current = rows.find((row) => row.priorityId === priority.priorityId);
      if (!current) {
        errors.push("Built-in priorities cannot be deleted.");
        break;
      }
      if (current.value !== priority.value) {
        errors.push("Built-in priorities cannot change number.");
        break;
      }
    }

    return errors;
  }, [rows, board.taskPriorities]);

  const removedCustomTaskCount = useMemo(() => {
    const rowIds = new Set(rows.map((row) => row.priorityId));
    return board.taskPriorities
      .filter((priority) => !priority.isSystem && !rowIds.has(priority.priorityId))
      .reduce(
        (count, priority) =>
          count +
          board.tasks.filter((task) => task.priorityId === priority.priorityId).length,
        0,
      );
  }, [rows, board.taskPriorities, board.tasks]);

  if (!open) return null;

  const save = () => {
    if (validationErrors.length > 0) return;
    // Sort on save so the persisted board order always matches numeric priority order.
    const taskPriorities = sortPrioritiesByValue(
      rows.map(({ taskCount: _taskCount, ...priority }) => priority),
    );
    patchPriorities.mutate(
      { boardId: board.boardId, taskPriorities },
      {
        onSuccess: () => onClose(),
        onError: (err) => reportMutationError("task priorities", err),
      },
    );
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",
          MODAL_BACKDROP_SURFACE_CLASS,
        )}
        role="presentation"
        onPointerDown={backdropDismiss.onPointerDown}
        onClick={backdropDismiss.onClick}
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={dialogRef}
          tabIndex={-1}
          // Dialogs opt back into selection so board-wide drag suppression does not block editing text.
          className={cn(
            "max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text",
            MODAL_DIALOG_OVERSCROLL_CLASS,
            MODAL_TEXT_FIELD_CURSOR_CLASS,
          )}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            Task priorities
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Built-in priorities can be renamed and recolored, but their numbers stay locked.
          </p>

          {removedCustomTaskCount > 0 ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
              Removing custom priorities will leave {removedCustomTaskCount} task
              {removedCustomTaskCount === 1 ? "" : "s"} without a priority.
            </p>
          ) : null}

          {validationErrors.length > 0 ? (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {validationErrors[0]}
            </div>
          ) : null}

          <ul className="mt-4 space-y-3">
            {rows.map((row) => (
              <li
                key={row.priorityId}
                className="grid gap-2 rounded-md border border-border/70 p-3 md:grid-cols-[7rem_minmax(0,1fr)_8rem_auto]"
              >
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Number
                  </label>
                  <input
                    type="number"
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text disabled:cursor-not-allowed disabled:opacity-60"
                    value={row.value}
                    disabled={busy || row.isSystem}
                    aria-label={`Priority number ${row.label || row.priorityId}`}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setRows((prev) =>
                        prev.map((current) =>
                          current.priorityId === row.priorityId ? { ...current, value } : current,
                        ),
                      );
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Name
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text"
                      value={row.label}
                      disabled={busy}
                      placeholder="Priority name"
                      aria-label={`Priority name ${row.label || row.priorityId}`}
                      onChange={(e) => {
                        const label = e.target.value;
                        setRows((prev) =>
                          prev.map((current) =>
                            current.priorityId === row.priorityId ? { ...current, label } : current,
                          ),
                        );
                      }}
                    />
                    {row.isSystem ? (
                      <span className="shrink-0 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Built-in
                      </span>
                    ) : null}
                  </div>
                  {row.taskCount > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.taskCount} task{row.taskCount === 1 ? "" : "s"} use this
                      priority
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Color
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    {/* Keep the native picker for fast edits while preserving the hex value in text form. */}
                    <input
                      type="color"
                      className="h-9 w-10 rounded-md border border-input bg-background p-1"
                      value={isValidHexColor(row.color) ? row.color.trim() : "#3b82f6"}
                      disabled={busy}
                      aria-label={`Priority color ${row.label || row.priorityId}`}
                      onChange={(e) => {
                        const color = e.target.value;
                        setRows((prev) =>
                          prev.map((current) =>
                            current.priorityId === row.priorityId ? { ...current, color } : current,
                          ),
                        );
                      }}
                    />
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-sm text-foreground select-text"
                      value={row.color}
                      disabled={busy}
                      placeholder="#3b82f6"
                      aria-label={`Priority hex color ${row.label || row.priorityId}`}
                      onChange={(e) => {
                        const color = e.target.value;
                        setRows((prev) =>
                          prev.map((current) =>
                            current.priorityId === row.priorityId ? { ...current, color } : current,
                          ),
                        );
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busy || row.isSystem}
                    aria-label={
                      row.isSystem
                        ? "Built-in priority cannot be removed"
                        : "Remove priority row"
                    }
                    onClick={() =>
                      setRows((prev) => prev.filter((current) => current.priorityId !== row.priorityId))
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
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
                {
                  priorityId: nextLocalPriorityId(prev),
                  value: nextPriorityValue(prev),
                  label: "",
                  color: "#64748b",
                  isSystem: false,
                  taskCount: 0,
                },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            Add priority
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
              disabled={busy || validationErrors.length > 0}
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
