import { Plus } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Board, ReleaseDefinition } from "../../../../shared/models";
import { sortReleasesForDisplay } from "../../../../shared/releaseSort";
import { isValidHexColor } from "../../../../shared/hexColor";
import {
  ClearColorIconButton,
  ReleaseColorSwatchInput,
  releaseDateInputClass,
  releaseNameLabelClass,
  releaseRowDirty,
  rowCanSave,
} from "@/components/board/dialogs/releasesEditorShared";
import { ReleasesTable, type ReleaseRowDraft } from "@/components/board/dialogs/ReleasesTable";
import {
  useCreateBoardRelease,
  useDeleteBoardRelease,
  usePatchBoard,
  useUpdateBoardRelease,
} from "@/api/mutations";
import {
  parseReleaseApiErrorMessage,
  reportMutationError,
  reportReleaseMutationError,
} from "@/lib/mutationErrorUi";
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

interface ReleasesEditorDialogProps {
  board: Board;
  open: boolean;
  onClose: () => void;
}

export function ReleasesEditorDialog({
  board,
  open,
  onClose,
}: ReleasesEditorDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const createRelease = useCreateBoardRelease();
  const updateRelease = useUpdateBoardRelease();
  const deleteRelease = useDeleteBoardRelease();
  const patchBoard = usePatchBoard();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newDate, setNewDate] = useState("");
  const [rows, setRows] = useState<Record<number, ReleaseRowDraft>>({});
  const [showDiscard, setShowDiscard] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  /** Per-row save errors (e.g. duplicate name); cleared on edit or successful save. */
  const [rowSaveError, setRowSaveError] = useState<Record<number, string | null>>(
    {},
  );

  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteMoveToId, setDeleteMoveToId] = useState<string>("");

  const [autoUi, setAutoUi] = useState(false);
  const [autoCli, setAutoCli] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowDiscard(false);
    setCreateError(null);
    setRowSaveError({});
    setNewName("");
    setNewColor("");
    setNewDate("");
    setDeleteTargetId(null);
    const nextRows: Record<number, ReleaseRowDraft> = {};
    for (const r of board.releases) {
      nextRows[r.releaseId] = {
        name: r.name,
        color: r.color?.trim() ?? "",
        releaseDate: r.releaseDate?.trim() ?? "",
      };
    }
    setRows(nextRows);
    setAutoUi(board.autoAssignReleaseOnCreateUi);
    setAutoCli(board.autoAssignReleaseOnCreateCli);
  }, [open, board]);

  const taskCountByReleaseId = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of board.tasks) {
      const rid = t.releaseId;
      if (rid == null) continue;
      m.set(rid, (m.get(rid) ?? 0) + 1);
    }
    return m;
  }, [board.tasks]);

  const releasesInEditorOrder = useMemo(
    () => sortReleasesForDisplay(board.releases),
    [board.releases],
  );

  const autoTogglesDirty = useMemo(() => {
    if (!open) return false;
    return (
      autoUi !== board.autoAssignReleaseOnCreateUi ||
      autoCli !== board.autoAssignReleaseOnCreateCli
    );
  }, [open, autoUi, autoCli, board]);

  const isDirty = useMemo(() => {
    if (!open) return false;
    for (const r of board.releases) {
      const row = rows[r.releaseId];
      if (!row) return true;
      if (releaseRowDirty(r, row)) return true;
    }
    if (autoTogglesDirty) return true;
    return false;
  }, [open, board.releases, rows, autoTogglesDirty]);

  const busy =
    createRelease.isPending ||
    updateRelease.isPending ||
    deleteRelease.isPending ||
    patchBoard.isPending;

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

  const editorActive = open && !showDiscard && deleteTargetId == null;
  useShortcutOverlay(editorActive, "releases-editor", keyHandler);
  useModalFocusTrap({
    open,
    active: editorActive,
    containerRef: dialogRef,
  });

  const backdropDismiss = useBackdropDismissClick(requestClose, { disabled: busy });
  const dismissDeleteConfirm = useCallback(() => {
    setDeleteTargetId(null);
  }, []);
  const deleteConfirmBackdropDismiss = useBackdropDismissClick(dismissDeleteConfirm, {
    disabled: busy,
  });

  useBodyScrollLock(open);

  const setStarDefault = (releaseId: number) => {
    if (board.defaultReleaseId === releaseId) return;
    patchBoard.mutate(
      {
        boardId: board.boardId,
        defaultReleaseId: releaseId,
      },
      {
        onError: (err) => reportMutationError("set default release", err),
      },
    );
  };

  const clearDefaultRelease = () => {
    if (board.defaultReleaseId == null) return;
    patchBoard.mutate(
      {
        boardId: board.boardId,
        defaultReleaseId: null,
      },
      {
        onError: (err) => reportMutationError("clear default release", err),
      },
    );
  };

  const saveAutoAssign = () => {
    if (board.defaultReleaseId == null) return;
    patchBoard.mutate(
      {
        boardId: board.boardId,
        autoAssignReleaseOnCreateUi: autoUi,
        autoAssignReleaseOnCreateCli: autoCli,
      },
      {
        onError: (err) => reportMutationError("save auto-assign settings", err),
      },
    );
  };

  const saveRow = async (releaseId: number) => {
    const r = board.releases.find((x) => x.releaseId === releaseId);
    const row = rows[releaseId];
    if (!r || !row || !rowCanSave(r, row)) return;
    const colorTrim = row.color.trim();
    setRowSaveError((prev) => ({ ...prev, [releaseId]: null }));
    try {
      await updateRelease.mutateAsync({
        boardId: board.boardId,
        releaseId,
        name: row.name.trim(),
        color: colorTrim === "" ? null : colorTrim,
        releaseDate: row.releaseDate.trim() === "" ? null : row.releaseDate.trim(),
      });
      setRowSaveError((prev) => ({ ...prev, [releaseId]: null }));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setRowSaveError((prev) => ({
        ...prev,
        [releaseId]: parseReleaseApiErrorMessage(raw),
      }));
    }
  };

  const addRelease = () => {
    setCreateError(null);
    const name = newName.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }
    const c = newColor.trim();
    if (c && !isValidHexColor(c)) {
      setCreateError("Color must be a hex value like #3b82f6 or empty.");
      return;
    }
    createRelease.mutate(
      {
        boardId: board.boardId,
        name,
        color: c === "" ? null : c,
        releaseDate: newDate.trim() === "" ? null : newDate.trim(),
      },
      {
        onSuccess: () => {
          setNewName("");
          setNewColor("");
          setNewDate("");
        },
        onError: (err) => {
          const raw = err instanceof Error ? err.message : String(err);
          setCreateError(parseReleaseApiErrorMessage(raw));
        },
      },
    );
  };

  const confirmDelete = () => {
    if (deleteTargetId == null) return;
    const moveTo =
      deleteMoveToId === "" ? undefined : Number(deleteMoveToId);
    if (moveTo !== undefined && !Number.isFinite(moveTo)) return;
    deleteRelease.mutate(
      {
        boardId: board.boardId,
        releaseId: deleteTargetId,
        moveTasksToReleaseId: moveTo,
      },
      {
        onSuccess: () => {
          setDeleteTargetId(null);
          setDeleteMoveToId("");
        },
        onError: (err) => reportReleaseMutationError(err),
      },
    );
  };

  if (!open) return null;

  const deletePending = board.releases.find((r) => r.releaseId === deleteTargetId);
  const deleteTaskCount = deletePending
    ? (taskCountByReleaseId.get(deletePending.releaseId) ?? 0)
    : 0;
  const otherReleases = deletePending
    ? releasesInEditorOrder.filter((r) => r.releaseId !== deletePending.releaseId)
    : [];

  const hasDefault = board.defaultReleaseId != null;
  const defaultReleaseName =
    board.defaultReleaseId != null
      ? board.releases.find((r) => r.releaseId === board.defaultReleaseId)?.name ??
        `#${board.defaultReleaseId}`
      : null;

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
        {/* w-fit: dialog width follows controls; max-w keeps it inside the viewport on narrow screens. */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={dialogRef}
          tabIndex={-1}
          className={cn(
            "max-h-[90vh] w-fit min-w-0 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text",
            MODAL_DIALOG_OVERSCROLL_CLASS,
            MODAL_TEXT_FIELD_CURSOR_CLASS,
          )}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            Releases
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Define Board-wide releases. Releases must have unique names.
            Star the current release to quickly assign it to your tasks.
          </p>

          {createError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {createError}
            </p>
          ) : null}

          <div className="mt-4 space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">Add release</p>
            <div className="flex min-w-0 flex-nowrap items-end gap-2 pb-0.5">
              {/* Align with star column on release rows */}
              <div className="mb-0.5 w-10 shrink-0" aria-hidden />
              <label className={releaseNameLabelClass}>
                <span className="text-muted-foreground">Name</span>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Name"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={newName}
                  disabled={busy}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <div className="shrink-0 text-xs">
                <span className="text-muted-foreground">Color</span>
                <div className="mt-1 flex items-center gap-1">
                  <ReleaseColorSwatchInput
                    value={newColor}
                    disabled={busy}
                    ariaLabel="New release color"
                    onChange={setNewColor}
                  />
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-[7rem] shrink-0 rounded-md border border-input bg-background px-1.5 py-1.5 font-mono text-xs"
                    placeholder="#rrggbb"
                    value={newColor}
                    disabled={busy}
                    aria-label="New release color hex"
                    onChange={(e) => setNewColor(e.target.value)}
                  />
                  <ClearColorIconButton
                    disabled={busy || newColor.trim() === ""}
                    onClick={() => setNewColor("")}
                    label="Clear new release color"
                  />
                </div>
              </div>
              <label className="shrink-0 text-xs">
                <span className="text-muted-foreground">Release date</span>
                <input
                  type="date"
                  className={releaseDateInputClass}
                  value={newDate}
                  disabled={busy}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={busy}
                onClick={addRelease}
              >
                <Plus className="size-4" aria-hidden />
                Add
              </button>
            </div>
          </div>

          <ReleasesTable
            board={board}
            releasesInEditorOrder={releasesInEditorOrder}
            rows={rows}
            setRows={setRows}
            busy={busy}
            taskCountByReleaseId={taskCountByReleaseId}
            rowSaveError={rowSaveError}
            setRowSaveError={setRowSaveError}
            onSetDefault={setStarDefault}
            onSaveRow={saveRow}
            onRequestDelete={(releaseId) => {
              setDeleteTargetId(releaseId);
              setDeleteMoveToId("");
            }}
          />

          {board.releases.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No releases yet.</p>
          ) : null}

          <div className="mt-6 space-y-3 rounded-md border border-border bg-muted/15 p-3">
            <p className="text-sm font-medium text-foreground">
              Auto-Assign release
              {defaultReleaseName != null ? ` (${defaultReleaseName})` : ""} On Create
            </p>
            <p className="text-xs text-muted-foreground">
               Auto-assign the default release when new tasks are created. Works only when a default release is set.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={autoUi}
                disabled={busy || !hasDefault}
                onChange={(e) => setAutoUi(e.target.checked)}
              />
              Auto-assign on new tasks (web)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={autoCli}
                disabled={busy || !hasDefault}
                onChange={(e) => setAutoCli(e.target.checked)}
              />
              Auto-assign on new tasks (CLI / hirotm)
            </label>
            {autoTogglesDirty && hasDefault ? (
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={busy}
                onClick={saveAutoAssign}
              >
                Save auto-assign settings
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              disabled={busy || !hasDefault}
              onClick={clearDefaultRelease}
              aria-label={
                defaultReleaseName != null
                  ? `Clear default release ${defaultReleaseName}`
                  : "Clear default release"
              }
            >
              {hasDefault && defaultReleaseName != null
                ? `Clear default release (${defaultReleaseName})`
                : "Clear default release"}
            </button>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              disabled={busy}
              onClick={requestClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {deleteTargetId != null && deletePending ? (
        <div
          className={cn(
            "fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4",
            MODAL_BACKDROP_SURFACE_CLASS,
          )}
          role="presentation"
          onPointerDown={deleteConfirmBackdropDismiss.onPointerDown}
          onClick={deleteConfirmBackdropDismiss.onClick}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            className={cn(
              "w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-lg",
              MODAL_TEXT_FIELD_CURSOR_CLASS,
            )}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">Delete release?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {deleteTaskCount > 0
                ? `Move ${deleteTaskCount} task(s) to another release, or clear their release.`
                : "This release is unused."}
            </p>
            {deleteTaskCount > 0 && otherReleases.length > 0 ? (
              <label className="mt-3 block text-xs text-muted-foreground">
                Move tasks to
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={deleteMoveToId}
                  disabled={busy}
                  onChange={(e) => setDeleteMoveToId(e.target.value)}
                >
                  <option value="">Clear release (unassigned)</option>
                  {otherReleases.map((r) => (
                    <option key={r.releaseId} value={String(r.releaseId)}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                disabled={busy}
                onClick={() => setDeleteTargetId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                disabled={busy}
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
