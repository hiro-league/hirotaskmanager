import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  BOARD_COLOR_LABELS,
  BOARD_COLOR_PRESETS,
  type BoardColorPreset,
  resolvedBoardColor,
} from "../../../shared/boardColor";
import {
  EMPTY_BOARD_CLI_POLICY,
  FULL_BOARD_CLI_POLICY,
  type BoardCliPolicy,
} from "../../../shared/cliPolicy";
import type { Board } from "../../../shared/models";
import { usePatchBoard } from "@/api/mutations";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import { cn } from "@/lib/utils";
import { getBoardThemePreviewBackground } from "./boardTheme";
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

type PolicyField = {
  key: keyof BoardCliPolicy;
  label: string;
  hint?: string;
};

/** Grouped for two-column layout: access → tasks → lists → board-level. */
const POLICY_GROUPS: { title: string; fields: PolicyField[] }[] = [
  {
    title: "Access",
    fields: [
      {
        key: "readBoard",
        label: "Read board",
        hint: "Required for any other CLI action on this board.",
      },
    ],
  },
  {
    title: "Tasks",
    fields: [
      { key: "createTasks", label: "Create tasks" },
      {
        key: "manageCliCreatedTasks",
        label: "Manage CLI-created tasks",
        hint: "Edit, move, or delete tasks the CLI created.",
      },
      {
        key: "manageAnyTasks",
        label: "Manage any task",
        hint: "Also turns on managing CLI-created tasks.",
      },
    ],
  },
  {
    title: "Lists",
    fields: [
      { key: "createLists", label: "Create lists" },
      {
        key: "manageCliCreatedLists",
        label: "Manage CLI-created lists",
      },
      {
        key: "manageAnyLists",
        label: "Manage any list",
        hint: "Also turns on managing CLI-created lists.",
      },
    ],
  },
  {
    title: "Board",
    fields: [
      {
        key: "manageStructure",
        label: "Groups & priorities",
        hint: "Edit task groups and priority definitions.",
      },
      {
        key: "editBoard",
        label: "Board metadata & view",
        hint: "Name, emoji, description, theme, view prefs.",
      },
      { key: "deleteBoard", label: "Delete board" },
    ],
  },
];

function applyPolicyToggle(
  policy: BoardCliPolicy,
  key: keyof BoardCliPolicy,
  checked: boolean,
): BoardCliPolicy {
  let next: BoardCliPolicy = { ...policy, [key]: checked };
  if (key === "readBoard" && !checked) {
    next = { ...EMPTY_BOARD_CLI_POLICY };
  } else {
    if (key === "manageAnyTasks" && checked) {
      next = { ...next, manageCliCreatedTasks: true };
    }
    if (key === "manageAnyLists" && checked) {
      next = { ...next, manageCliCreatedLists: true };
    }
  }
  return next;
}

interface BoardEditDialogProps {
  board: Board;
  open: boolean;
  onClose: () => void;
}

export function BoardEditDialog({ board, open, onClose }: BoardEditDialogProps) {
  const titleId = useId();
  const policyFieldBaseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const patchBoard = usePatchBoard();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [boardColor, setBoardColor] = useState<BoardColorPreset | undefined>(
    undefined,
  );
  const [cliPolicy, setCliPolicy] = useState<BoardCliPolicy>(EMPTY_BOARD_CLI_POLICY);
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
    const col = resolvedBoardColor(board);
    const pol = board.cliPolicy ?? EMPTY_BOARD_CLI_POLICY;
    setName(n);
    setEmoji(e);
    setDescription(d);
    setBoardColor(col);
    setCliPolicy(pol);
    setBaseline(
      JSON.stringify({
        name: n,
        emoji: e,
        description: d,
        boardColor: col,
        cliPolicy: pol,
      }),
    );
  }, [open, board]);

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        name: name.trim() || "Untitled",
        emoji,
        description: description.trim(),
        boardColor,
        cliPolicy,
      }),
    [name, emoji, description, boardColor, cliPolicy],
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

  const backdropDismiss = useBackdropDismissClick(requestClose, { disabled: busy });

  useBodyScrollLock(open);

  if (!open) return null;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchBoard.mutate(
      {
        boardId: board.boardId,
        name: trimmed,
        emoji,
        description: description.trim(),
        boardColor,
        cliPolicy,
      },
      { onSuccess: () => onClose() },
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
          className={cn(
            "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg select-text",
            MODAL_DIALOG_OVERSCROLL_CLASS,
            MODAL_TEXT_FIELD_CURSOR_CLASS,
          )}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            Edit board
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Name, icon, description, theme, and hirotm CLI permissions for this board.
          </p>
          {emojiFieldError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {emojiFieldError}
            </p>
          ) : null}

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

          <div className="mt-6">
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

          <details className="group mt-6 rounded-lg border border-border bg-muted/15">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden hover:bg-muted/40">
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden
              />
              Hirotm CLI access
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                local API / hirotm
              </span>
            </summary>
            <div className="space-y-4 border-t border-border px-3 pb-3 pt-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => setCliPolicy({ ...FULL_BOARD_CLI_POLICY })}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => setCliPolicy({ ...EMPTY_BOARD_CLI_POLICY })}
                >
                  Deselect all
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Permissions for unauthenticated local API clients. Turning off &quot;Read board&quot;
                clears the rest.
              </p>
              {POLICY_GROUPS.map((group) => (
                <div key={group.title}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </h4>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {group.fields.map(({ key, label, hint }) => {
                      const disabled =
                        busy || (!cliPolicy.readBoard && key !== "readBoard");
                      const id = `${policyFieldBaseId}-${key}`;
                      const fullWidth =
                        group.fields.length === 1 ||
                        (group.title === "Access" && key === "readBoard");
                      return (
                        <li
                          key={key}
                          className={cn(
                            "flex gap-2.5",
                            fullWidth && "sm:col-span-2",
                          )}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 rounded border-input"
                            checked={cliPolicy[key]}
                            disabled={disabled}
                            onChange={(e) =>
                              setCliPolicy(
                                applyPolicyToggle(
                                  cliPolicy,
                                  key,
                                  e.target.checked,
                                ),
                              )
                            }
                          />
                          <div className="min-w-0">
                            <label
                              htmlFor={id}
                              className="text-sm font-medium leading-snug text-foreground"
                            >
                              {label}
                            </label>
                            {hint ? (
                              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                                {hint}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </details>

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
