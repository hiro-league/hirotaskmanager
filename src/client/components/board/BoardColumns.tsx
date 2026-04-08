import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Board } from "../../../shared/models";
import { EmojiPickerMenuButton } from "@/components/emoji/EmojiPickerMenuButton";
import {
  DragDropProvider,
  DragOverlay as ReactDragOverlay,
} from "@dnd-kit/react";
import { useCreateList, useMoveList, usePatchBoardViewPrefs } from "@/api/mutations";
import { boardKeys, useStatusWorkflowOrder } from "@/api/queries";
import { BoardDragOverlayContent } from "./BoardDragOverlayContent";
import { boardColumnSpreadProps } from "./boardColumnData";
import {
  bandWeightsForBoard,
  visibleStatusesForBoard,
} from "./boardStatusUtils";
import { BoardListColumn } from "./BoardListColumn";
import { laneBandContainerId } from "./dndIds";
import { StatusLabelColumn } from "./StatusLabelColumn";
import { useBoardKeyboardNavOptional } from "./shortcuts/BoardKeyboardNavContext";
import { useLanesBoardDnd } from "./useLanesBoardDnd";

interface BoardColumnsProps {
  board: Board;
}

export function AddListSlot({
  boardId,
  open,
  insertAfterListId,
  onOpen,
  onClose,
  stacked = false,
}: {
  boardId: number;
  open: boolean;
  insertAfterListId: number | null;
  onOpen: (insertAfterListId: number | null) => void;
  onClose: () => void;
  /** Stacked layout: column-aligned, content height (no full-height lane). */
  stacked?: boolean;
}) {
  const qc = useQueryClient();
  const createList = useCreateList();
  const moveList = useMoveList();
  const boardKeyboardNav = useBoardKeyboardNavOptional();
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
    const beforeBoard = qc.getQueryData<Board>(boardKeys.detail(boardId));
    if (!beforeBoard) return;
    const prevOrder = [...beforeBoard.lists]
      .sort((x, y) => x.order - y.order)
      .map((l) => l.id);
    const anchor = insertAfterListId;

    createList.mutate(
      { boardId, name: trimmed, emoji: listEmoji ?? null },
      {
        onSuccess: (data) => {
          const newList = data.entity;
          cancel();
          // After creating a list, make it current so the board follows the
          // user's last action instead of leaving the old selection in place.
          boardKeyboardNav?.selectList(newList.id);
          if (anchor == null) return;
          const anchorIdx = prevOrder.indexOf(anchor);
          if (anchorIdx < 0) return;
          const nextListId = prevOrder[anchorIdx + 1];
          moveList.mutate({
            boardId: data.boardId,
            listId: newList.id,
            beforeListId: nextListId == null ? undefined : nextListId,
            position: nextListId == null ? "last" : undefined,
          });
        },
      },
    );
  };

  const shellClass = stacked
    ? "flex w-72 shrink-0 flex-col self-start"
    : "flex h-full min-h-0 w-72 shrink-0 flex-col self-start";

  if (!open) {
    return (
      <div ref={shellRef} className={shellClass} data-board-no-pan>
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 hover:text-foreground"
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
          disabled={createList.isPending}
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
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground select-text"
          placeholder="Enter list name…"
          value={name}
          disabled={createList.isPending}
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
          disabled={createList.isPending || !name.trim()}
          onClick={() => submit()}
        >
          Add list
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Cancel"
          disabled={createList.isPending}
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
  const [addListOpen, setAddListOpen] = useState(false);
  const [insertAfterListId, setInsertAfterListId] = useState<number | null>(null);
  useEffect(() => {
    boardKeyboardNav?.setListColumnOrder(localListIds);
  }, [boardKeyboardNav, localListIds]);

  useEffect(() => {
    return boardKeyboardNav?.registerOpenAddListComposer((anchorListId) => {
      // Render the inline composer in-place after the anchor list so keyboard `L`
      // opens exactly where the new list will land.
      setInsertAfterListId(anchorListId);
      setAddListOpen(true);
    });
  }, [boardKeyboardNav]);

  const closeAddList = useCallback(() => {
    setAddListOpen(false);
    setInsertAfterListId(null);
  }, []);

  const [weights, setWeights] = useState<number[]>(() =>
    bandWeightsForBoard(board, workflowOrder),
  );
  const weightsRef = useRef(weights);
  weightsRef.current = weights;

  const weightsSyncKey = JSON.stringify(board.statusBandWeights ?? null);
  const visKey = visibleStatuses.join("\0");

  const boardRef = useRef(board);
  boardRef.current = board;

  useEffect(() => {
    setWeights(bandWeightsForBoard(boardRef.current, workflowOrder));
  }, [board.id, visKey, weightsSyncKey, workflowOrder]);

  const flushWeights = useCallback(() => {
    const b = qc.getQueryData<Board>(boardKeys.detail(board.id));
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
      boardId: b.id,
      patch: { statusBandWeights: [...w] },
    });
  }, [board.id, qc, patchViewPrefs, workflowOrder]);

  const adjustAt = useCallback((i: number, deltaY: number) => {
    setWeights((w) => {
      if (i < 0 || i >= w.length - 1) return w;
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
  }, []);

  const overlayTask =
    activeTaskId != null
      ? board.tasks.find((task) => task.id === activeTaskId)
      : undefined;

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
                const list = board.lists.find((l) => l.id === id);
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
                    taskMap={Object.fromEntries(
                      visibleStatuses.map((status) => [
                        laneBandContainerId(id, status),
                        displayTaskMap[laneBandContainerId(id, status)] ?? [],
                      ]),
                    )}
                    isTaskDragActive={activeTaskId != null}
                  />,
                ];
                if (addListOpen && insertAfterListId === id) {
                  items.push(
                    <AddListSlot
                      key={`add-after-${id}`}
                      boardId={board.id}
                      open
                      insertAfterListId={insertAfterListId}
                      onOpen={setInsertAfterListId}
                      onClose={closeAddList}
                    />,
                  );
                }
                return items;
              })}
            </div>
            <AddListSlot
              boardId={board.id}
              open={addListOpen && insertAfterListId == null}
              insertAfterListId={null}
              onOpen={(anchorListId) => {
                setInsertAfterListId(anchorListId);
                setAddListOpen(true);
              }}
              onClose={closeAddList}
            />
          </div>
        </div>
        <ReactDragOverlay dropAnimation={null} style={{ zIndex: 60 }}>
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
