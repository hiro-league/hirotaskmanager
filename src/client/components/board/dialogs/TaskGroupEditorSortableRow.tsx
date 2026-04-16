import { GripVertical, Star, Trash2 } from "lucide-react";
import {
  encodeTaskGroupRowRef,
  formatTaskGroupRowLabel,
  type TaskGroupEditorRow,
} from "../../../../shared/taskGroupConfig";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import { cn } from "@/lib/utils";
import { useTaskGroupEditorSortableRow } from "./useTaskGroupEditorSortableRow";

export interface TaskGroupMoveToOption {
  ref: string;
  label: string;
}

export interface TaskGroupEditorSortableRowProps {
  row: TaskGroupEditorRow;
  index: number;
  busy: boolean;
  reorderDisabled: boolean;
  baselineIds: Set<number>;
  taskCountByGroupId: Map<number, number>;
  defaultRef: string;
  onDefaultRef: (ref: string) => void;
  isNewRow: boolean;
  isDeleting: boolean;
  /** Other active groups (non-empty labels) that can receive tasks from this row on delete. */
  moveToOptions: TaskGroupMoveToOption[];
  deleteChoice: string;
  onDeleteChoiceChange: (clientId: string, value: string) => void;
  onRemoveNew: (clientId: string) => void;
  /** Delete-select blocked (default group, move target for others, or invalid state). */
  deleteDisabled: boolean;
  deleteTitle?: string;
  onEmojiPick: (clientId: string, emoji: string | null) => void;
  onLabelChange: (clientId: string, label: string) => void;
  onNameBlur?: (clientId: string) => void;
  setEmojiFieldError: (message: string | null) => void;
}

export function TaskGroupEditorSortableRow({
  row,
  index,
  busy,
  reorderDisabled,
  baselineIds,
  taskCountByGroupId,
  defaultRef,
  onDefaultRef,
  isNewRow,
  isDeleting,
  moveToOptions,
  deleteChoice,
  onDeleteChoiceChange,
  onRemoveNew,
  deleteDisabled,
  deleteTitle,
  onEmojiPick,
  onLabelChange,
  onNameBlur,
  setEmojiFieldError,
}: TaskGroupEditorSortableRowProps) {
  const dragDisabled = busy || reorderDisabled || isDeleting;
  const { ref, handleRef, isDragging } = useTaskGroupEditorSortableRow(
    row.clientId,
    index,
    dragDisabled,
  );

  const taskCount = baselineIds.has(row.groupId)
    ? (taskCountByGroupId.get(row.groupId) ?? 0)
    : 0;
  const showMoveTo = moveToOptions.length > 0 || taskCount === 0;
  const rowRef = encodeTaskGroupRowRef(row, baselineIds);
  const isDefaultForNewTasks = defaultRef === rowRef;
  const canSetAsDefault = row.label.trim().length > 0 && !isDeleting;
  // Lock emoji when row is marked for deletion (defensive: use deleteChoice too so UI stays in sync).
  const emojiPickerDisabled =
    busy || isDeleting || (!isNewRow && deleteChoice !== "");

  return (
    <li
      ref={ref}
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-1 rounded-md border border-transparent sm:flex-nowrap",
        isDeleting && "opacity-70",
        isDragging &&
          "border-dashed border-primary/30 bg-muted/30 opacity-90 shadow-none",
      )}
    >
      <button
        type="button"
        ref={handleRef}
        className={cn(
          "shrink-0 touch-none rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground",
          dragDisabled && "cursor-not-allowed opacity-30",
          !dragDisabled && "cursor-grab active:cursor-grabbing",
        )}
        disabled={dragDisabled}
        aria-label="Drag to reorder task group"
        title="Drag to reorder"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <EmojiPickerMenuButton
        emoji={row.emoji}
        disabled={emojiPickerDisabled}
        onValidationError={setEmojiFieldError}
        chooseAriaLabel="Choose emoji for group"
        selectedAriaLabel={(e) => `Group emoji ${e}`}
        onPick={(next) => {
          setEmojiFieldError(null);
          onEmojiPick(row.clientId, next);
        }}
      />
      <div className="flex min-w-0 max-w-[min(100%,48rem)] shrink-0 items-center gap-2">
        <div className="w-56 max-w-[80%] min-w-0 sm:w-64">
          <input
            type="text"
            className={cn(
              "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground select-text",
              isDeleting && "line-through text-muted-foreground",
            )}
            value={row.label}
            disabled={busy || isDeleting}
            autoFocus={isNewRow && row.label.trim().length === 0}
            placeholder="Name"
            aria-label={`Group ${row.label || row.groupId}`}
            onChange={(e) => onLabelChange(row.clientId, e.target.value)}
            onBlur={() => onNameBlur?.(row.clientId)}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {baselineIds.has(row.groupId)
            ? `${taskCount} task${taskCount === 1 ? "" : "s"}`
            : "New"}
        </span>
      </div>
      <button
        type="button"
        className={
          isDefaultForNewTasks
            ? "shrink-0 rounded-md p-2 text-amber-600 hover:bg-muted dark:text-amber-400 disabled:opacity-50"
            : "shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        }
        disabled={busy || !canSetAsDefault}
        aria-label={
          isDefaultForNewTasks
            ? "Default group for new tasks"
            : "Set as default group for new tasks"
        }
        aria-pressed={isDefaultForNewTasks}
        title={
          isDefaultForNewTasks
            ? "Default for new tasks"
            : "Make default for new tasks"
        }
        onClick={() => onDefaultRef(rowRef)}
      >
        <Star
          className={`size-4 ${isDefaultForNewTasks ? "fill-current" : ""}`}
          aria-hidden
        />
      </button>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:flex-nowrap">
        {isNewRow ? (
          <p className="flex-1 text-xs text-muted-foreground">
            New group
          </p>
        ) : isDefaultForNewTasks ? (
          <p className="flex-1 text-xs text-muted-foreground">
            Default group. Star another group to delete this one.
          </p>
        ) : showMoveTo ? (
          <label className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <select
              className="min-w-0 w-52 max-w-full rounded-md border border-input bg-background px-1.5 py-1 text-sm text-foreground sm:w-60"
              disabled={busy || deleteDisabled}
              value={deleteChoice}
              onChange={(e) => onDeleteChoiceChange(row.clientId, e.target.value)}
              aria-label="Delete and move tasks to group"
              title={deleteTitle}
            >
              <option value="">Keep group</option>
              {taskCount === 0 ? (
                <option value="__delete__">Delete group</option>
              ) : null}
              {taskCount > 0 && moveToOptions.map((o) => (
                <option key={o.ref} value={o.ref}>
                  {`Delete and tasks to: ${o.label}`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="flex-1 text-xs text-muted-foreground">
            {taskCount > 0
              ? "Add another active group first."
              : "Delete group unavailable here."}
          </p>
        )}
        {isNewRow ? (
          <button
            type="button"
            className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
            disabled={busy}
            aria-label="Remove new group"
            title="Remove new group"
            onClick={() => onRemoveNew(row.clientId)}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** Compact clone for DragOverlay (avoids measuring full row chrome). */
export function TaskGroupEditorDragOverlayPreview({
  row,
}: {
  row: TaskGroupEditorRow;
}) {
  return (
    <div className="flex max-w-md items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate text-sm font-medium text-foreground">
        {formatTaskGroupRowLabel(row)}
      </span>
    </div>
  );
}
