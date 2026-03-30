import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, MeasuringStrategy } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { Board } from "../../../shared/models";
import { sortableListId } from "./dndIds";
import { useCreateList, usePatchBoardViewPrefs } from "@/api/mutations";
import { boardKeys, useStatusWorkflowOrder } from "@/api/queries";
import { BoardDragOverlayContent } from "./BoardDragOverlayContent";
import {
  bandWeightsForBoard,
  visibleStatusesForBoard,
} from "./boardStatusUtils";
import { BoardListColumn } from "./BoardListColumn";
import { StatusLabelColumn } from "./StatusLabelColumn";
import { useLanesBoardDnd } from "./useLanesBoardDnd";

interface BoardColumnsProps {
  board: Board;
}

export function AddListSlot({
  boardId,
  stacked = false,
}: {
  boardId: number;
  /** Stacked layout: column-aligned, content height (no full-height lane). */
  stacked?: boolean;
}) {
  const createList = useCreateList();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  const cancel = () => {
    setOpen(false);
    setName("");
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createList.mutate(
      { boardId, name: trimmed },
      { onSuccess: () => cancel() },
    );
  };

  const shellClass = stacked
    ? "flex w-72 shrink-0 flex-col self-start"
    : "flex h-full min-h-0 w-72 shrink-0 flex-col self-start";

  if (!open) {
    return (
      <div className={shellClass} data-board-no-pan>
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 hover:text-foreground"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Add list
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${shellClass} rounded-lg border border-border bg-list-column p-2 shadow-sm`}
      data-board-no-pan
    >
      <input
        ref={inputRef}
        type="text"
        className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground"
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
    activeId,
    sensors,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    reorderPending,
    displayTaskMap,
    activeTaskId,
    visibleStatuses,
  } = useLanesBoardDnd(board);

  const overlayTask =
    activeTaskId != null
      ? board.tasks.find((t) => t.id === activeTaskId)
      : undefined;

  const sortableListItemIds = useMemo(
    () => localListIds.map(sortableListId),
    [localListIds],
  );

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
      const top = Math.max(0.12, (next[i] ?? 1) - deltaY * k);
      const bot = Math.max(0.12, (next[i + 1] ?? 1) + deltaY * k);
      next[i] = top;
      next[i + 1] = bot;
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{
          droppable: { strategy: MeasuringStrategy.WhileDragging },
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
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
            <SortableContext
              items={sortableListItemIds}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex min-h-0 flex-row gap-4">
                {localListIds.map((id) => (
                  <BoardListColumn
                    key={id}
                    board={board}
                    listId={id}
                    visibleStatuses={visibleStatuses}
                    weights={weights}
                    taskMap={displayTaskMap}
                  />
                ))}
              </div>
            </SortableContext>
            <AddListSlot boardId={board.id} />
          </div>
        </div>
        <DragOverlay dropAnimation={null} zIndex={60}>
          <BoardDragOverlayContent
            board={board}
            overlayTask={overlayTask}
            activeListId={activeId}
            layout="lanes"
            visibleStatuses={visibleStatuses}
            weights={weights}
          />
        </DragOverlay>
      </DndContext>
    </div>
  );
}
