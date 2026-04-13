import { Eraser, Plus, Save, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Board, ReleaseDefinition } from "../../../shared/models";
import {
  useCreateBoardRelease,
  useDeleteBoardRelease,
  usePatchBoard,
  useUpdateBoardRelease,
} from "@/api/mutations";
import { cn } from "@/lib/utils";
import { DiscardChangesDialog } from "./shortcuts/DiscardChangesDialog";
import { useShortcutOverlay } from "./shortcuts/ShortcutScopeContext";
import { useBackdropDismissClick } from "./shortcuts/useBackdropDismissClick";
import { useDialogCloseRequest } from "./shortcuts/useDialogCloseRequest";
import { useBodyScrollLock } from "./shortcuts/bodyScrollLock";
import {
  MODAL_BACKDROP_SURFACE_CLASS,
  MODAL_DIALOG_OVERSCROLL_CLASS,
  MODAL_TEXT_FIELD_CURSOR_CLASS,
} from "./shortcuts/modalOverlayClasses";
import { useModalFocusTrap } from "./shortcuts/useModalFocusTrap";

interface ReleasesEditorDialogProps {
  board: Board;
  open: boolean;
  onClose: () => void;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** Native color input needs a valid hex when the stored value is empty or invalid. */
const DEFAULT_PICKER_HEX = "#3b82f6";

/** Map `fetchJson` Error.message (often JSON `{ error }`) to a short UI string. */
function parseReleaseApiErrorMessage(raw: string): string {
  let msg = raw.trim();
  try {
    const j = JSON.parse(raw) as { error?: unknown };
    if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
  } catch {
    /* keep msg as body text */
  }
  if (
    /duplicate/i.test(msg) ||
    /Could not create release/i.test(msg) ||
    msg === "Release not found or duplicate name" ||
    /already exists on this board/i.test(msg)
  ) {
    return "A release with this name already exists on this board.";
  }
  if (msg.length > 0 && msg.length < 220) return msg;
  return "Could not save.";
}

/** ~Half the prior flex-1 / min-w-[10rem] name column; fixed so color/date columns stay aligned. */
const releaseNameLabelClass = "w-20 shrink-0 text-xs sm:w-24";

/** Native date picker glyph can blend into `bg-background` in dark mode; invert for contrast. */
const releaseDateInputClass =
  "mt-1 block h-9 min-w-[11rem] rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground " +
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 " +
  "dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-90";

/** Icon-only clear for color fields; keeps release rows on one line. */
function ClearColorIconButton(props: {
  disabled: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      title="Clear color"
      aria-label={props.label ?? "Clear color"}
      disabled={props.disabled}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      onClick={props.onClick}
    >
      <Eraser className="size-4" aria-hidden />
    </button>
  );
}

function colorPickerDisplayValue(hex: string): string {
  const t = hex.trim();
  return HEX_COLOR_RE.test(t) ? t : DEFAULT_PICKER_HEX;
}

/**
 * Native `<input type="color">` must use a valid hex `value`, so we keep the fallback internally
 * but hide the swatch when the release has no saved color — show dashed “empty” chrome instead.
 */
function ReleaseColorSwatchInput(props: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (hex: string) => void;
}) {
  const trimmed = props.value.trim();
  const hasColor = HEX_COLOR_RE.test(trimmed);
  return (
    <div
      className={cn(
        "relative h-9 w-10 shrink-0 overflow-hidden rounded-md border bg-background",
        hasColor ? "border-input" : "border-dashed border-muted-foreground/45 bg-muted/35",
      )}
    >
      {hasColor ? (
        <span
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: trimmed }}
          aria-hidden
        />
      ) : (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-medium text-muted-foreground/60"
          aria-hidden
        >
          —
        </span>
      )}
      <input
        type="color"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        value={colorPickerDisplayValue(props.value)}
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

function releaseRowDirty(
  r: ReleaseDefinition,
  row: { name: string; color: string; releaseDate: string },
): boolean {
  const origColor = r.color?.trim() ?? "";
  const origDate = r.releaseDate?.trim() ?? "";
  return (
    row.name.trim() !== r.name ||
    row.color.trim() !== origColor ||
    row.releaseDate.trim() !== origDate
  );
}

function rowCanSave(
  r: ReleaseDefinition,
  row: { name: string; color: string; releaseDate: string },
): boolean {
  if (!row.name.trim()) return false;
  const c = row.color.trim();
  if (c && !HEX_COLOR_RE.test(c)) return false;
  return releaseRowDirty(r, row);
}

/** Editor list only: non-empty release dates descending, then undated rows in creation order. */
function sortReleasesForEditorDisplay(
  releases: readonly ReleaseDefinition[],
): ReleaseDefinition[] {
  const dated: ReleaseDefinition[] = [];
  const undated: ReleaseDefinition[] = [];
  for (const r of releases) {
    const d = r.releaseDate?.trim() ?? "";
    if (d !== "") dated.push(r);
    else undated.push(r);
  }
  dated.sort((a, b) => {
    const da = (a.releaseDate ?? "").trim();
    const db = (b.releaseDate ?? "").trim();
    const cmp = db.localeCompare(da);
    if (cmp !== 0) return cmp;
    return b.releaseId - a.releaseId;
  });
  undated.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.releaseId - b.releaseId,
  );
  return [...dated, ...undated];
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
  const [rows, setRows] = useState<
    Record<number, { name: string; color: string; releaseDate: string }>
  >({});
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
    const nextRows: Record<number, { name: string; color: string; releaseDate: string }> =
      {};
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
    () => sortReleasesForEditorDisplay(board.releases),
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
    patchBoard.mutate({
      boardId: board.boardId,
      defaultReleaseId: releaseId,
    });
  };

  const clearDefaultRelease = () => {
    if (board.defaultReleaseId == null) return;
    patchBoard.mutate({
      boardId: board.boardId,
      defaultReleaseId: null,
    });
  };

  const saveAutoAssign = () => {
    if (board.defaultReleaseId == null) return;
    patchBoard.mutate({
      boardId: board.boardId,
      autoAssignReleaseOnCreateUi: autoUi,
      autoAssignReleaseOnCreateCli: autoCli,
    });
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
    if (c && !HEX_COLOR_RE.test(c)) {
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

          <ul className="mt-4 space-y-3">
            {releasesInEditorOrder.map((r) => {
              const row = rows[r.releaseId] ?? {
                name: r.name,
                color: r.color ?? "",
                releaseDate: r.releaseDate ?? "",
              };
              const tc = taskCountByReleaseId.get(r.releaseId) ?? 0;
              const isDefault = board.defaultReleaseId === r.releaseId;
              const dirty = releaseRowDirty(r, row);
              const canSave = rowCanSave(r, row);
              const saveErr = rowSaveError[r.releaseId];
              return (
                <li
                  key={r.releaseId}
                  className={cn(
                    "flex min-w-0 flex-col rounded-md border p-2 pb-2.5",
                    dirty
                      ? "border-primary/50 ring-1 ring-inset ring-primary/20 dark:border-primary/45"
                      : "border-border",
                  )}
                >
                  <div className="flex min-w-0 flex-nowrap items-end gap-2">
                  <button
                    type="button"
                    className={
                      isDefault
                        ? "mb-0.5 shrink-0 rounded-md p-2 text-amber-600 hover:bg-muted dark:text-amber-400 disabled:opacity-50"
                        : "mb-0.5 shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    }
                    disabled={busy || !row.name.trim()}
                    aria-label={
                      isDefault
                        ? "Default release for keyboard shortcut and auto-assign"
                        : "Set as default release"
                    }
                    aria-pressed={isDefault}
                    title={
                      isDefault ? "Default release" : "Make default release"
                    }
                    onClick={() => setStarDefault(r.releaseId)}
                  >
                    <Star
                      className={`size-4 ${isDefault ? "fill-current" : ""}`}
                      aria-hidden
                    />
                  </button>
                  <label className={releaseNameLabelClass}>
                    <span className="text-muted-foreground">Name</span>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      value={row.name}
                      disabled={busy}
                      onChange={(e) => {
                        setRowSaveError((prev) => ({ ...prev, [r.releaseId]: null }));
                        setRows((prev) => ({
                          ...prev,
                          [r.releaseId]: { ...row, name: e.target.value },
                        }));
                      }}
                    />
                  </label>
                  <div className="shrink-0 text-xs">
                    <span className="text-muted-foreground">Color</span>
                    <div className="mt-1 flex items-center gap-1">
                      <ReleaseColorSwatchInput
                        value={row.color}
                        disabled={busy}
                        ariaLabel={`Release color ${row.name || r.releaseId}`}
                        onChange={(hex) => {
                          setRowSaveError((prev) => ({ ...prev, [r.releaseId]: null }));
                          setRows((prev) => ({
                            ...prev,
                            [r.releaseId]: { ...row, color: hex },
                          }));
                        }}
                      />
                      <input
                        type="text"
                        className="w-[7rem] shrink-0 rounded-md border border-input bg-background px-1.5 py-1.5 font-mono text-xs"
                        value={row.color}
                        disabled={busy}
                        placeholder="#rrggbb"
                        aria-label={`Release hex ${row.name || r.releaseId}`}
                        onChange={(e) => {
                          setRowSaveError((prev) => ({ ...prev, [r.releaseId]: null }));
                          setRows((prev) => ({
                            ...prev,
                            [r.releaseId]: { ...row, color: e.target.value },
                          }));
                        }}
                      />
                      <ClearColorIconButton
                        disabled={busy || row.color.trim() === ""}
                        label={`Clear color for ${row.name || `release ${r.releaseId}`}`}
                        onClick={() => {
                          setRowSaveError((prev) => ({ ...prev, [r.releaseId]: null }));
                          setRows((prev) => ({
                            ...prev,
                            [r.releaseId]: { ...row, color: "" },
                          }));
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-end gap-1">
                    <label className="text-xs">
                      <span className="text-muted-foreground">Release date</span>
                      <input
                        type="date"
                        className={releaseDateInputClass}
                        value={row.releaseDate}
                        disabled={busy}
                        onChange={(e) => {
                          setRowSaveError((prev) => ({ ...prev, [r.releaseId]: null }));
                          setRows((prev) => ({
                            ...prev,
                            [r.releaseId]: { ...row, releaseDate: e.target.value },
                          }));
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      disabled={busy}
                      title={
                        tc > 0
                          ? `Delete release (${tc} task${tc === 1 ? "" : "s"})`
                          : "Delete release"
                      }
                      aria-label={`Delete release ${row.name || r.releaseId}`}
                      onClick={() => {
                        setDeleteTargetId(r.releaseId);
                        setDeleteMoveToId("");
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                    {/* h-9 w-9 matches delete; invisible Save keeps date adjacent to delete when clean. */}
                    <div className="h-9 w-9 shrink-0">
                      <button
                        type="button"
                        title="Save changes to this release"
                        className={
                          "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-50 " +
                          (!dirty ? "invisible pointer-events-none" : "")
                        }
                        disabled={busy || !dirty || !canSave}
                        tabIndex={dirty ? 0 : -1}
                        aria-hidden={!dirty}
                        aria-label={`Save release ${row.name || r.releaseId}`}
                        onClick={() => void saveRow(r.releaseId)}
                      >
                        <Save className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  </div>
                  {saveErr ? (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {saveErr}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

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
