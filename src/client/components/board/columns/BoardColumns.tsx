import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Board } from "../../../../shared/models";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import {
  DragDropProvider,
  DragOverlay as ReactDragOverlay,
} from "@dnd-kit/react";
import { usePatchBoardViewPrefs } from "@/api/mutations";
import { boardKeys, useStatusWorkflowOrder } from "@/api/queries";
import { BoardDragOverlayContent } from "../dnd/BoardDragOverlayContent";
import { boardColumnSpreadProps } from "../boardColumnData";
import {
  bandWeightsForBoard,
  visibleStatusesForBoard,
} from "../boardStatusUtils";
import { BoardListColumn } from "./BoardListColumn";
import { EMPTY_SORTABLE_IDS, laneBandContainerId } from "../dnd/dndIds";
import { StatusLabelColumn } from "./StatusLabelColumn";
import { useBoardKeyboardNavOptional } from "../shortcuts/BoardKeyboardNavContext";
import { useLanesBoardDnd } from "../dnd/useLanesBoardDnd";
import { useAddListComposer } from "./useAddListComposer";

const DRAG_OVERLAY_STYLE = { zIndex: 60 } as const;

interface BoardColumnsProps {
  board: Board;
}

export function AddListSlot({
  open,
  insertAfterListId,
  onOpen,
  onClose,
  onSubmit,
  isPending,
  stacked = false,
}: {
  open: boolean;
  insertAfterListId: number | null;
  onOpen: (insertAfterListId: number | null) => void;
  onClose: () => void;
  /** Submits the new list via the parent-owned mutation so the observer survives slot remounts. */
  onSubmit: (input: { name: string; emoji: string | null }) => void;
  isPending: boolean;
  /** Stacked layout: column-aligned, content height (no full-height lane). */
  stacked?: boolean;
}) {
  const [name, setName] = useState("");
  const [listEmoji, setListEmoji] = useState<string | null>(null);
  const [emojiFieldError, setEmojiFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setEmojiFieldError(null);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      shellRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, [open, insertAfterListId]);

  const cancel = () => {
    setName("");
    setListEmoji(null);
    onClose();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, emoji: listEmoji });
    setName("");
    setListEmoji(null);
    setEmojiFieldError(null);
  };

  const shellClass = stacked
    ? "flex w-72 shrink-0 flex-col self-start"
    : "flex h-full min-h-0 w-72 shrink-0 flex-col self-start";

  if (!open) {
    return (
      <div ref={shellRef} className={shellClass} data-board-no-pan>
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={isPending}
          aria-busy={isPending}
          onClick={() => onOpen(null)}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Add list
        </button>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`${shellClass} rounded-lg border border-border bg-list-column p-2 shadow-sm`}
      data-board-no-pan
    >
      {emojiFieldError ? (
        <p className="mb-1 text-xs text-destructive" role="alert">
          {emojiFieldError}
        </p>
      ) : null}
      {/* The add-list editor restores selection inside the board's non-selectable drag surface. */}
      <div className="flex gap-2">
        <EmojiPickerMenuButton
          emoji={listEmoji}
          disabled={isPending}
          onValidationError={setEmojiFieldError}
          chooseAriaLabel="Choose list emoji"
          selectedAriaLabel={(e) => `List emoji ${e}`}
          onPick={(next) => {
            setEmojiFieldError(null);
            setListEmoji(next);
          }}
        />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground select-text"
          placeholder="Enter list name…"
          value={name}
          disabled={isPending}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") cancel();
          }}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={isPending || !name.trim()}
          onClick={() => submit()}
        >
          Add list
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Cancel"
          disabled={isPending}
          onClick={cancel}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function BoardColumns({ board }: BoardColumnsProps) {
  const qc = useQueryClient();
  const patchViewPrefs = usePatchBoardViewPrefs();
  const workflowOrder = useStatusWorkflowOrder();

  const {
    localListIds,
    activeId: activeListId,
    activeTaskId,
    displayTaskMap,
    onDragStart,
    onDragOver,
    onDragEnd,
    reorderPending,
    tasksByListStatus,
  } = useLanesBoardDnd(board);
  const visibleStatuses = visibleStatusesForBoard(board, workflowOrder);

  const boardKeyboardNav = useBoardKeyboardNavOptional();
  const {
    addListOpen,
    insertAfterListId,
    setInsertAfterListId,
    closeAddList,
    onOpenTrailingAddList,
    submitList,
    isPending: addListPending,
  } = useAddListComposer(board.boardId);
  useEffect(() => {
    boardKeyboardNav?.setListColumnOrder(localListIds);
  }, [boardKeyboardNav, localListIds]);

  const weightsSyncKey = JSON.stringify(board.statusBandWeights ?? null);
  const visKey = visibleStatuses.join("\0");

  const serverWeights = useMemo(
    () => bandWeightsForBoard(board, workflowOrder),
    // Intentionally omit `board` identity: refetches must not reset lane weights or clear drag (§2.3).
    [board.boardId, visKey, weightsSyncKey, workflowOrder],
  );
  const [dragWeights, setDragWeights] = useState<number[] | null>(null);

  useEffect(() => {
    setDragWeights(null);
  }, [serverWeights]);

  const weights = dragWeights ?? serverWeights;
  const weightsRef = useRef(weights);
  weightsRef.current = weights;

  const flushWeights = useCallback(() => {
    const b = qc.getQueryData<Board>(boardKeys.detail(board.boardId));
    if (!b) return;
    const w = weightsRef.current;
    const vis = visibleStatusesForBoard(b, workflowOrder);
    if (w.length !== vis.length) return;
    const prev = b.statusBandWeights;
    if (
      prev &&
      prev.length === w.length &&
      prev.every((x, i) => Math.abs(x - (w[i] ?? 0)) < 1e-6)
    ) {
      return;
    }
    patchViewPrefs.mutate({
      boardId: b.boardId,
      patch: { statusBandWeights: [...w] },
    });
  }, [board.boardId, qc, patchViewPrefs, workflowOrder]);

  const adjustAt = useCallback((i: number, deltaY: number) => {
    setDragWeights((prev) => {
      const w = prev ?? serverWeights;
      if (i < 0 || i >= w.length - 1) return prev;
      const next = [...w];
      const k = 0.004;
      // Follow the pointer direction: dragging down grows the band above,
      // dragging up grows the band below.
      const top = Math.max(0.12, (next[i] ?? 1) + deltaY * k);
      const bot = Math.max(0.12, (next[i + 1] ?? 1) - deltaY * k);
      next[i] = top;
      next[i + 1] = bot;
      return next;
    });
  }, [serverWeights]);

  const overlayTask =
    activeTaskId != null
      ? board.tasks.find((task) => task.taskId === activeTaskId)
      : undefined;

  const laneTaskMapsByListId = useMemo(() => {
    const out = new Map<number, Record<string, string[]>>();
    for (const id of localListIds) {
      out.set(
        id,
        Object.fromEntries(
          visibleStatuses.map((status) => {
            const laneId = laneBandContainerId(id, status);
            return [laneId, displayTaskMap[laneId] ?? EMPTY_SORTABLE_IDS] as const;
          }),
        ),
      );
    }
    return out;
  }, [localListIds, visibleStatuses, displayTaskMap]);

  /** O(1) list lookup vs `.find` inside flatMap (react-best-practices P4.2). */
  const listsById = useMemo(
    () => new Map(board.lists.map((l) => [l.listId, l] as const)),
    [board.lists],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DragDropProvider
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col items-start"
          role="list"
          aria-label="Board lists"
        >
          <div className="flex h-full min-h-0 w-max min-w-full shrink-0 flex-row items-stretch gap-5 bg-transparent">
            <StatusLabelColumn
              visibleStatuses={visibleStatuses}
              weights={weights}
              adjustAt={adjustAt}
              flushWeights={flushWeights}
              splittersDisabled={reorderPending}
            />
            <div className="flex min-h-0 flex-row gap-4">
              {localListIds.flatMap((id, index) => {
                const list = listsById.get(id);
                if (!list) return [];
                const items = [
                  <BoardListColumn
                    key={id}
                    {...boardColumnSpreadProps(board)}
                    list={list}
                    listId={id}
                    listIndex={index}
                    visibleStatuses={visibleStatuses}
                    weights={weights}
                    tasksByListStatus={tasksByListStatus}
                    taskMap={laneTaskMapsByListId.get(id)!}
                    isTaskDragActive={activeTaskId != null}
                  />,
                ];
                if (addListOpen && insertAfterListId === id) {
                  items.push(
                    <AddListSlot
                      key={`add-after-${id}`}
                      open
                      insertAfterListId={insertAfterListId}
                      onOpen={setInsertAfterListId}
                      onClose={closeAddList}
                      onSubmit={submitList}
                      isPending={addListPending}
                    />,
                  );
                }
                return items;
              })}
            </div>
            <AddListSlot
              open={addListOpen && insertAfterListId == null}
              insertAfterListId={null}
              onOpen={onOpenTrailingAddList}
              onClose={closeAddList}
              onSubmit={submitList}
              isPending={addListPending}
            />
          </div>
        </div>
        <ReactDragOverlay dropAnimation={null} style={DRAG_OVERLAY_STYLE}>
          {overlayTask != null || activeListId != null ? (
            <BoardDragOverlayContent
              board={board}
              overlayTask={overlayTask}
              activeListId={activeListId}
              layout="lanes"
              visibleStatuses={visibleStatuses}
              weights={weights}
              tasksByListStatus={tasksByListStatus}
            />
          ) : null}
        </ReactDragOverlay>
      </DragDropProvider>
    </div>
  );
}
