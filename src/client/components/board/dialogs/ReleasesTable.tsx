import { Save, Star, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { Board, ReleaseDefinition } from "../../../../shared/models";
import { cn } from "@/lib/utils";
import {
  ClearColorIconButton,
  ReleaseColorSwatchInput,
  releaseNameLabelClass,
  releaseDateInputClass,
  releaseRowDirty,
  rowCanSave,
} from "@/components/board/dialogs/releasesEditorShared";

export type ReleaseRowDraft = { name: string; color: string; releaseDate: string };

export interface ReleasesTableProps {
  board: Board;
  releasesInEditorOrder: ReleaseDefinition[];
  rows: Record<number, ReleaseRowDraft>;
  setRows: Dispatch<SetStateAction<Record<number, ReleaseRowDraft>>>;
  busy: boolean;
  taskCountByReleaseId: Map<number, number>;
  rowSaveError: Record<number, string | null>;
  setRowSaveError: Dispatch<SetStateAction<Record<number, string | null>>>;
  onSetDefault: (releaseId: number) => void;
  onSaveRow: (releaseId: number) => void | Promise<void>;
  onRequestDelete: (releaseId: number) => void;
}

export function ReleasesTable({
  board,
  releasesInEditorOrder,
  rows,
  setRows,
  busy,
  taskCountByReleaseId,
  rowSaveError,
  setRowSaveError,
  onSetDefault,
  onSaveRow,
  onRequestDelete,
}: ReleasesTableProps) {
  return (
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
                title={isDefault ? "Default release" : "Make default release"}
                onClick={() => onSetDefault(r.releaseId)}
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
                  onClick={() => onRequestDelete(r.releaseId)}
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
                    onClick={() => void onSaveRow(r.releaseId)}
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
  );
}
