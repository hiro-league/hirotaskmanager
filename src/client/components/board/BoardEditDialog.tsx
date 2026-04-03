import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BOARD_COLOR_LABELS,
  BOARD_COLOR_PRESETS,
  type BoardColorPreset,
  resolvedBoardColor,
} from "../../../shared/boardColor";
import {
  BOARD_CLI_ACCESS,
  type BoardCliAccess,
} from "../../../shared/boardCliAccess";
import type { Board } from "../../../shared/models";
import { usePatchBoard } from "@/api/mutations";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import { cn } from "@/lib/utils";
import { getBoardThemePreviewBackground } from "./boardTheme";
import { DiscardChangesDialog } from "./shortcuts/DiscardChangesDialog";
import { useShortcutOverlay } from "./shortcuts/ShortcutScopeContext";
import { useDialogCloseRequest } from "./shortcuts/useDialogCloseRequest";
import { useModalFocusTrap } from "./shortcuts/useModalFocusTrap";

const CLI_LABELS: Record<BoardCliAccess, string> = {
  none: "None (CLI blocked)",
  read: "Read",
  read_write: "Read/Write",
};

interface BoardEditDialogProps {
  board: Board;
  open: boolean;
  onClose: () => void;
}

export function BoardEditDialog({ board, open, onClose }: BoardEditDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const patchBoard = usePatchBoard();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [cliAccess, setCliAccess] = useState<BoardCliAccess>("none");
  const [boardColor, setBoardColor] = useState<BoardColorPreset | undefined>(
    undefined,
  );
  const [baseline, setBaseline] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const [emojiFieldError, setEmojiFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setShowDiscard(false);
    setEmojiFieldError(null);
    const n = board.name.trim() || "Untitled";
    const e = board.emoji ?? null;
    const d = board.description ?? "";
    const c = board.cliAccess ?? "none";
    const col = resolvedBoardColor(board);
    setName(n);
    setEmoji(e);
    setDescription(d);
    setCliAccess(c);
    setBoardColor(col);
    setBaseline(
      JSON.stringify({
        name: n,
        emoji: e,
        description: d,
        cliAccess: c,
        boardColor: col,
      }),
    );
  }, [open, board]);

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        name: name.trim() || "Untitled",
        emoji,
        description: description.trim(),
        cliAccess,
        boardColor,
      }),
    [name, emoji, description, cliAccess, boardColor],
  );

  const isDirty = open && snapshot !== baseline;
  const busy = patchBoard.isPending;

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

  const editActive = open && !showDiscard;
  useShortcutOverlay(editActive, "board-edit-dialog", keyHandler);
  useModalFocusTrap({
    open,
    active: editActive,
    containerRef: dialogRef,
  });

  if (!open) return null;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchBoard.mutate(
      {
        boardId: board.id,
        name: trimmed,
        emoji,
        description: description.trim(),
        cliAccess,
        boardColor,
      },
      { onSuccess: () => onClose() },
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
          ref={dialogRef}
          tabIndex={-1}
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            Edit board
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Name, icon, description, CLI access for hirotm, and board theme.
          </p>
          {emojiFieldError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {emojiFieldError}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">
            New boards default to CLI access &quot;None&quot;. Grant Read or
            Read/Write here so the hirotm CLI can open or edit this board.
          </p>

          <label className="mt-4 block text-sm font-medium text-foreground">
            Name
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="mt-3">
            <span className="text-sm font-medium text-foreground">Icon</span>
            <div className="mt-1 flex items-center gap-2">
              <EmojiPickerMenuButton
                emoji={emoji}
                disabled={busy}
                onValidationError={setEmojiFieldError}
                chooseAriaLabel="Choose board emoji"
                selectedAriaLabel={(x) => `Board emoji ${x}`}
                onPick={(next) => setEmoji(next)}
              />
            </div>
          </div>

          <label className="mt-4 block text-sm font-medium text-foreground">
            Description
            <textarea
              className="mt-1 min-h-[4.5rem] w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Plain text notes for this board"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-foreground">
            CLI access (hirotm)
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={cliAccess}
              disabled={busy}
              onChange={(e) =>
                setCliAccess(e.target.value as BoardCliAccess)
              }
            >
              {BOARD_CLI_ACCESS.map((v) => (
                <option key={v} value={v}>
                  {CLI_LABELS[v]}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4">
            <span className="text-sm font-medium text-foreground">
              Board theme
            </span>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {BOARD_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={busy}
                  title={BOARD_COLOR_LABELS[preset]}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border p-1 text-[10px] text-muted-foreground hover:bg-muted/60",
                    boardColor === preset && "ring-2 ring-ring",
                  )}
                  onClick={() => setBoardColor(preset)}
                >
                  <span
                    className="block size-8 rounded border-2 border-border/60"
                    style={{
                      background: getBoardThemePreviewBackground(preset),
                    }}
                    aria-hidden
                  />
                  <span className="max-w-full truncate px-0.5">
                    {BOARD_COLOR_LABELS[preset]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={busy || !name.trim()}
              onClick={save}
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
