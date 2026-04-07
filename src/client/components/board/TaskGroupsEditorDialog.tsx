import { move } from "@dnd-kit/helpers";
import {
  DragDropProvider,
  DragOverlay as DndDragOverlay,
} from "@dnd-kit/react";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  nextGroupId,
  sortTaskGroupsForDisplay,
  type Board,
} from "../../../shared/models";
import {
  buildPatchBoardTaskGroupConfigFromEditor,
  decodeTaskGroupRowRef,
  encodeTaskGroupRowRef,
  formatTaskGroupRowLabel,
  type TaskGroupEditorRow,
  type TaskGroupSelection,
} from "../../../shared/taskGroupConfig";
import { usePatchBoardTaskGroups } from "@/api/mutations";
import {
  getOperationSourceId,
  type BoardReactDragEndEvent,
  type BoardReactDragOverEvent,
  type BoardReactDragStartEvent,
} from "./dndReactOps";
import {
  TaskGroupEditorDragOverlayPreview,
  TaskGroupEditorSortableRow,
  type TaskGroupMoveToOption,
} from "./TaskGroupEditorSortableRow";
import { DiscardChangesDialog } from "./shortcuts/DiscardChangesDialog";
import { useShortcutOverlay } from "./shortcuts/ShortcutScopeContext";
import { useDialogCloseRequest } from "./shortcuts/useDialogCloseRequest";
import { useModalFocusTrap } from "./shortcuts/useModalFocusTrap";

interface TaskGroupsEditorDialogProps {
  board: Board;
  open: boolean;
  onClose: () => void;
}

const DELETE_WITHOUT_MOVE = "__delete__";

type TaskGroupDraftRow = TaskGroupEditorRow & {
  /**
   * Existing row only:
   * - "" => keep
   * - encoded ref => delete and move to that surviving row
   * - DELETE_WITHOUT_MOVE => delete with no explicit move (allowed only when no tasks)
   */
  deleteChoice: string;
};

export function TaskGroupsEditorDialog({
  board,
  open,
  onClose,
}: TaskGroupsEditorDialogProps) {
  const titleId = useId();
  const dialogDescId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const patchGroups = usePatchBoardTaskGroups();
  const [rows, setRows] = useState<TaskGroupDraftRow[]>([]);
  /** Snapshot when dialog opens — used for dirty detection (Phase 4 close-request path). */
  const [baseline, setBaseline] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const [emojiFieldError, setEmojiFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Encoded ref for the starred default group (new tasks + board fallback when delete omits move). */
  const [defaultRef, setDefaultRef] = useState("");

  const [activeDragClientId, setActiveDragClientId] = useState<string | null>(
    null,
  );

  const isDraggingRef = useRef(false);
  const rowsRef = useRef<TaskGroupDraftRow[]>([]);
  const rowsSnapshotRef = useRef<TaskGroupDraftRow[]>([]);
  rowsRef.current = rows;

  const baselineIds = useMemo(
    () => new Set(board.taskGroups.map((g) => g.id)),
    [board.taskGroups],
  );

  const taskCountByGroupId = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of board.tasks) {
      m.set(t.groupId, (m.get(t.groupId) ?? 0) + 1);
    }
    return m;
  }, [board.tasks]);

  useEffect(() => {
    if (!open) return;
    setShowDiscard(false);
    setEmojiFieldError(null);
    setSaveError(null);
    const initial: TaskGroupDraftRow[] =
      board.taskGroups.length > 0
        ? sortTaskGroupsForDisplay(board.taskGroups).map((g) => ({
            ...g,
            clientId: `existing-${g.id}`,
            deleteChoice: "",
          }))
        : [
            {
              id: 0,
              label: "",
              emoji: null,
              sortOrder: 0,
              clientId: crypto.randomUUID(),
              deleteChoice: "",
            },
          ];
    const trimmedInit = initial.filter((r) => r.label.trim().length > 0);
    const b = baselineIds;
    if (trimmedInit.length > 0) {
      const def =
        initial.find((r) => r.id === board.defaultTaskGroupId) ??
        trimmedInit[0]!;
      const dr = encodeTaskGroupRowRef(def, b);
      setRows(initial);
      // Ignore blank new rows when deciding whether Apply should be enabled.
      setBaseline(buildDraftSignature(initial, dr, b));
      setDefaultRef(dr);
    } else {
      setRows(initial);
      setBaseline(buildDraftSignature(initial, "", b));
      setDefaultRef("");
    }
  }, [open, board.taskGroups, board.defaultTaskGroupId, baselineIds]);

  /** Keep default star on a valid active row when labels/order change (not while dragging). */
  useEffect(() => {
    if (!open) return;
    if (isDraggingRef.current) return;
    const trimmed = rows
      .filter((r) => !isDeletingDraftRow(r, baselineIds))
      .filter((r) => r.label.trim().length > 0);
    if (trimmed.length === 0) {
      setDefaultRef("");
      return;
    }
    const valid = new Set(
      trimmed.map((r) => encodeTaskGroupRowRef(r, baselineIds)),
    );
    const firstRef = encodeTaskGroupRowRef(trimmed[0]!, baselineIds);
    setDefaultRef((d) => (valid.has(d) ? d : firstRef));
  }, [open, rows, baselineIds]);

  /** Coerce delete choices when labels / delete state change (not while dragging a row). */
  useEffect(() => {
    if (!open) return;
    if (isDraggingRef.current) return;
    setRows((prev) => {
      const next = prev.map((row) => {
        const validChoices = validDeleteChoicesForRow(
          row,
          prev,
          baselineIds,
          taskCountByGroupId,
        );
        if (validChoices.has(row.deleteChoice)) return row;
        return { ...row, deleteChoice: "" };
      });
      let changed = false;
      for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== next[i]) {
          changed = true;
          break;
        }
      }
      return changed ? next : prev;
    });
  }, [open, rows, baselineIds, taskCountByGroupId]);

  const onTaskGroupDragStart = useCallback(
    (event: BoardReactDragStartEvent) => {
      isDraggingRef.current = true;
      const sid = getOperationSourceId(event);
      if (sid) setActiveDragClientId(sid);
      rowsSnapshotRef.current = rowsRef.current.map((r) => ({ ...r }));
    },
    [],
  );

  const onTaskGroupDragOver = useCallback(
    (event: BoardReactDragOverEvent) => {
      if (event.operation.target == null) return;
      setRows((prev) => {
        const activeRows = prev.filter((r) => !isDeletingDraftRow(r, baselineIds));
        const ids = activeRows.map((r) => r.clientId);
        const nextIds = move(ids, event);
        if (nextIds.length !== ids.length) return prev;
        let changed = false;
        for (let i = 0; i < ids.length; i++) {
          if (ids[i] !== nextIds[i]) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
        const activeById = new Map(activeRows.map((r) => [r.clientId, r]));
        let activeIndex = 0;
        return prev.map((row) => {
          if (isDeletingDraftRow(row, baselineIds)) return row;
          const nextRow = activeById.get(nextIds[activeIndex++]!);
          return nextRow ?? row;
        });
      });
    },
    [baselineIds],
  );

  const onTaskGroupDragEnd = useCallback((event: BoardReactDragEndEvent) => {
    isDraggingRef.current = false;
    setActiveDragClientId(null);
    if (event.canceled) {
      setRows(rowsSnapshotRef.current.map((r) => ({ ...r })));
    }
  }, []);

  const isDirty = useMemo(() => {
    if (!open) return false;
    return buildDraftSignature(rows, defaultRef, baselineIds) !== baseline;
  }, [open, rows, baseline, defaultRef, baselineIds]);

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

  const activeRows = useMemo(() => {
    return rows
      .filter((r) => !isDeletingDraftRow(r, baselineIds))
      .map(stripDraftRow);
  }, [rows, baselineIds]);

  const trimmedRows = useMemo(() => {
    return activeRows
      .map((r) => ({
        ...r,
        label: r.label.trim(),
        emoji: r.emoji ?? null,
      }))
      .filter((r) => r.label.length > 0)
      .map((r, i) => ({ ...r, sortOrder: i }));
  }, [activeRows]);

  const dragOverlayRow = useMemo(
    () =>
      activeDragClientId
        ? rows.find((x) => x.clientId === activeDragClientId)
        : undefined,
    [activeDragClientId, rows],
  );

  const rowEncodedRef = useCallback(
    (row: TaskGroupEditorRow) => encodeTaskGroupRowRef(row, baselineIds),
    [baselineIds],
  );

  const isMoveTargetForOthers = useCallback(
    (row: TaskGroupDraftRow) => {
      const myRef = rowEncodedRef(row);
      return rows.some((o) => {
        if (o.clientId === row.clientId) return false;
        return isDeletingDraftRow(o, baselineIds) && o.deleteChoice === myRef;
      });
    },
    [rows, rowEncodedRef, baselineIds],
  );

  const handleDeleteChoiceChange = useCallback(
    (clientId: string, value: string) => {
      const row = rows.find((r) => r.clientId === clientId);
      if (!row || !row.label.trim()) return;
      if (!isPersistedDraftRow(row, baselineIds)) return;

      if (value !== "" && rowEncodedRef(row) === defaultRef) {
        setSaveError(
          "Star another group as default for new tasks before removing this one.",
        );
        return;
      }
      if (value !== "" && isMoveTargetForOthers(row)) {
        setSaveError(
          "Another row still moves tasks into this group. Change its “Move to” first.",
        );
        return;
      }

      const validChoices = validDeleteChoicesForRow(
        row,
        rows,
        baselineIds,
        taskCountByGroupId,
      );
      if (!validChoices.has(value)) {
        setSaveError(
          "Choose a valid delete target for this group before saving.",
        );
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.clientId === clientId ? { ...r, deleteChoice: value } : r,
        ),
      );
      setSaveError(null);
    },
    [
      rows,
      baselineIds,
      defaultRef,
      isMoveTargetForOthers,
      rowEncodedRef,
      taskCountByGroupId,
    ],
  );

  const handleNameBlur = useCallback(
    (clientId: string) => {
      setRows((prev) => {
        const row = prev.find((r) => r.clientId === clientId);
        if (!row) return prev;
        if (isPersistedDraftRow(row, baselineIds)) return prev;
        if (row.label.trim().length > 0) return prev;
        return prev.filter((r) => r.clientId !== clientId);
      });
    },
    [baselineIds],
  );

  if (!open) return null;

  const canSave = trimmedRows.length > 0 && defaultRef.length > 0 && isDirty;

  const save = () => {
    if (!canSave) return;
    setSaveError(null);
    let config;
    try {
      const deleteMoves = new Map<number, TaskGroupSelection | null>();
      for (const row of rows) {
        if (!isDeletingDraftRow(row, baselineIds)) continue;
        if (row.deleteChoice === DELETE_WITHOUT_MOVE) {
          deleteMoves.set(row.id, null);
        } else {
          deleteMoves.set(row.id, decodeTaskGroupRowRef(row.deleteChoice));
        }
      }
      config = buildPatchBoardTaskGroupConfigFromEditor(board, activeRows, {
        defaultGroup: decodeTaskGroupRowRef(defaultRef),
        deleteMoves,
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Invalid task groups");
      return;
    }
    patchGroups.mutate(
      {
        boardId: board.id,
        config,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          setSaveError(
            err instanceof Error ? err.message : "Failed to save task groups",
          );
        },
      },
    );
  };

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
          aria-describedby={dialogDescId}
          ref={dialogRef}
          tabIndex={-1}
          // Dialogs opt back into selection so board-wide drag suppression does not block editing text.
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            Task groups
          </h2>
          <p id={dialogDescId} className="mt-1 text-sm text-muted-foreground">
            Names used to categorize tasks on this board. Empty rows are ignored.
            The star marks the default group for new tasks. At least one group must
            remain.
          </p>
          {emojiFieldError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {emojiFieldError}
            </p>
          ) : null}
          {saveError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {saveError}
            </p>
          ) : null}

          <p className="mt-4 text-xs text-muted-foreground">
            Drag the grip to reorder. Click the star to set the default for new
            tasks. Choosing a delete target marks that row for deletion until you
            save or switch it back to Keep group.
          </p>

          <DragDropProvider
            onDragStart={onTaskGroupDragStart}
            onDragOver={onTaskGroupDragOver}
            onDragEnd={onTaskGroupDragEnd}
          >
            <ul className="mt-2 space-y-2">
              {rows.map((row, index) => {
                const moveOpts = moveToOptionsForRow(row, rows, baselineIds);
                const isNewRow = !isPersistedDraftRow(row, baselineIds);
                const isDeleting = isDeletingDraftRow(row, baselineIds);
                const tasks = baselineIds.has(row.id)
                  ? (taskCountByGroupId.get(row.id) ?? 0)
                  : 0;
                const isStarredDefault =
                  encodeTaskGroupRowRef(row, baselineIds) === defaultRef;
                const blockedAsTarget = isMoveTargetForOthers(row);
                const deleteDisabled =
                  (!isDeleting && isStarredDefault) ||
                  blockedAsTarget ||
                  (tasks > 0 && moveOpts.length === 0);
                let deleteTitle: string | undefined;
                if (!isDeleting && isStarredDefault) {
                  deleteTitle =
                    "Star another group as default before removing this one";
                } else if (blockedAsTarget) {
                  deleteTitle =
                    "Another row still moves tasks into this group";
                } else if (tasks > 0 && moveOpts.length === 0) {
                  deleteTitle = "Add another named group to move tasks into";
                }

                return (
                  <TaskGroupEditorSortableRow
                    key={row.clientId}
                    row={row}
                    index={index}
                    busy={busy}
                    reorderDisabled={rows.length <= 1}
                    baselineIds={baselineIds}
                    taskCountByGroupId={taskCountByGroupId}
                    defaultRef={defaultRef}
                    onDefaultRef={setDefaultRef}
                    isNewRow={isNewRow}
                    isDeleting={isDeleting}
                    moveToOptions={moveOpts}
                    deleteChoice={row.deleteChoice}
                    onDeleteChoiceChange={handleDeleteChoiceChange}
                    onRemoveNew={(clientId) =>
                      setRows((prev) =>
                        prev.filter((x) => x.clientId !== clientId),
                      )
                    }
                    deleteDisabled={deleteDisabled}
                    deleteTitle={deleteTitle}
                    onEmojiPick={(clientId, next) =>
                      setRows((prev) =>
                        prev.map((x) =>
                          x.clientId === clientId ? { ...x, emoji: next } : x,
                        ),
                      )
                    }
                    onLabelChange={(clientId, label) =>
                      setRows((prev) =>
                        prev.map((x) =>
                          x.clientId === clientId ? { ...x, label } : x,
                        ),
                      )
                    }
                    onNameBlur={handleNameBlur}
                    setEmojiFieldError={setEmojiFieldError}
                  />
                );
              })}
            </ul>
            <DndDragOverlay dropAnimation={null} style={{ zIndex: 60 }}>
              {dragOverlayRow ? (
                <TaskGroupEditorDragOverlayPreview row={dragOverlayRow} />
              ) : null}
            </DndDragOverlay>
          </DragDropProvider>

          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              setRows((prev) => [
                ...pruneBlankNewRows(prev, baselineIds),
                {
                  id: nextGroupId(prev),
                  label: "",
                  emoji: null,
                  sortOrder: prev.length,
                  clientId: crypto.randomUUID(),
                  deleteChoice: "",
                },
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
              disabled={busy || !canSave}
              onClick={() => save()}
            >
              Apply
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

function moveToOptionsForRow(
  row: TaskGroupDraftRow,
  allRows: TaskGroupDraftRow[],
  baselineIds: Set<number>,
): TaskGroupMoveToOption[] {
  return allRows
    .filter(
      (r) =>
        r.clientId !== row.clientId &&
        r.label.trim().length > 0 &&
        !isDeletingDraftRow(r, baselineIds),
    )
    .map((r) => ({
      ref: encodeTaskGroupRowRef(r, baselineIds),
      label: formatTaskGroupRowLabel(r),
    }));
}

function validDeleteChoicesForRow(
  row: TaskGroupDraftRow,
  allRows: TaskGroupDraftRow[],
  baselineIds: Set<number>,
  taskCountByGroupId: Map<number, number>,
): Set<string> {
  const out = new Set<string>([""]);
  if (!isPersistedDraftRow(row, baselineIds)) return out;
  const taskCount = taskCountByGroupId.get(row.id) ?? 0;
  if (taskCount === 0) out.add(DELETE_WITHOUT_MOVE);
  for (const option of moveToOptionsForRow(row, allRows, baselineIds)) {
    out.add(option.ref);
  }
  return out;
}

function isPersistedDraftRow(
  row: TaskGroupDraftRow,
  baselineIds: Set<number>,
): boolean {
  return baselineIds.has(row.id);
}

function isDeletingDraftRow(
  row: TaskGroupDraftRow,
  baselineIds: Set<number>,
): boolean {
  return isPersistedDraftRow(row, baselineIds) && row.deleteChoice !== "";
}

function stripDraftRow(row: TaskGroupDraftRow): TaskGroupEditorRow {
  const { deleteChoice: _deleteChoice, ...rest } = row;
  return rest;
}

function pruneBlankNewRows(
  rows: TaskGroupDraftRow[],
  baselineIds: Set<number>,
): TaskGroupDraftRow[] {
  return rows.filter(
    (row) => isPersistedDraftRow(row, baselineIds) || row.label.trim().length > 0,
  );
}

function buildDraftSignature(
  rows: TaskGroupDraftRow[],
  defaultRef: string,
  baselineIds: Set<number>,
): string {
  const normalized = pruneBlankNewRows(rows, baselineIds).map((row) => ({
    id: row.id,
    clientId: row.clientId,
    label: row.label.trim(),
    emoji: row.emoji ?? null,
    deleteChoice: row.deleteChoice,
  }));
  return JSON.stringify({
    defaultRef,
    rows: normalized,
  });
}
