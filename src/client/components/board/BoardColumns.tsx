import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { Board } from "../../../shared/models";
import { useCreateList, useReorderLists, useUpdateBoard } from "@/api/mutations";
import {
  bandWeightsForBoard,
  visibleStatusesForBoard,
} from "./boardStatusUtils";
import { BoardListColumn, BoardListColumnOverlay } from "./BoardListColumn";
import { StatusLabelColumn } from "./StatusLabelColumn";

interface BoardColumnsProps {
  board: Board;
}

function sortedListIds(board: Board): string[] {
  return [...board.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.id);
}

const listCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;
  return closestCenter(args);
};

function AddListSlot({ boardId }: { boardId: string }) {
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

  if (!open) {
    return (
      <div className="flex h-full min-h-0 w-72 shrink-0 flex-col self-start">
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
    <div className="flex h-full min-h-0 w-72 shrink-0 flex-col self-start rounded-lg border border-border bg-card p-2 shadow-sm">
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
  const updateBoard = useUpdateBoard();
  const reorder = useReorderLists();

  const visibleStatuses = useMemo(
    () => visibleStatusesForBoard(board),
    [board],
  );

  const serverListIds = useMemo(() => sortedListIds(board), [board]);

  const [localListIds, setLocalListIds] = useState(serverListIds);
  const localListIdsRef = useRef(localListIds);
  localListIdsRef.current = localListIds;

  const [activeId, setActiveId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalListIds(serverListIds);
    }
  }, [serverListIds]);

  const [weights, setWeights] = useState<number[]>(() =>
    bandWeightsForBoard(board),
  );
  const weightsRef = useRef(weights);
  weightsRef.current = weights;

  const weightsSyncKey = JSON.stringify(board.statusBandWeights ?? null);
  const visKey = visibleStatuses.join("\0");

  const boardRef = useRef(board);
  boardRef.current = board;

  useEffect(() => {
    setWeights(bandWeightsForBoard(boardRef.current));
  }, [board.id, visKey, weightsSyncKey]);

  const flushWeights = useCallback(() => {
    const b = qc.getQueryData<Board>(["boards", board.id]);
    if (!b) return;
    const w = weightsRef.current;
    const vis = visibleStatusesForBoard(b);
    if (w.length !== vis.length) return;
    const prev = b.statusBandWeights;
    if (
      prev &&
      prev.length === w.length &&
      prev.every((x, i) => Math.abs(x - (w[i] ?? 0)) < 1e-6)
    ) {
      return;
    }
    updateBoard.mutate({
      ...b,
      statusBandWeights: [...w],
      updatedAt: new Date().toISOString(),
    });
  }, [board.id, qc, updateBoard]);

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
      disabled: reorder.isPending,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      disabled: reorder.isPending,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    isDraggingRef.current = true;
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (over == null) return;
      const aid = String(active.id);
      const oid = String(over.id);
      if (aid === oid) return;

      setLocalListIds((prev) => {
        const oldIndex = prev.indexOf(aid);
        const newIndex = prev.indexOf(oid);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [],
  );

  const handleDragEnd = useCallback(
    (_event: DragEndEvent) => {
      isDraggingRef.current = false;
      setActiveId(null);

      const finalOrder = localListIdsRef.current;
      const serverOrder = sortedListIds(boardRef.current);

      if (finalOrder.join(",") === serverOrder.join(",")) return;

      reorder.mutate({
        boardId: boardRef.current.id,
        orderedListIds: finalOrder,
      });
    },
    [reorder],
  );

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveId(null);
    setLocalListIds(sortedListIds(boardRef.current));
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={listCollision}
        measuring={{
          droppable: { strategy: MeasuringStrategy.Always },
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          role="list"
          aria-label="Board lists"
        >
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full min-h-0 w-max min-w-full flex-row items-stretch gap-5 bg-transparent">
              <StatusLabelColumn
                visibleStatuses={visibleStatuses}
                weights={weights}
                adjustAt={adjustAt}
                flushWeights={flushWeights}
                splittersDisabled={reorder.isPending}
              />
              <SortableContext
                items={localListIds}
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
                    />
                  ))}
                </div>
              </SortableContext>
              <AddListSlot boardId={board.id} />
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={null} zIndex={60}>
          {activeId ? (
            <BoardListColumnOverlay
              board={board}
              listId={activeId}
              visibleStatuses={visibleStatuses}
              weights={weights}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
