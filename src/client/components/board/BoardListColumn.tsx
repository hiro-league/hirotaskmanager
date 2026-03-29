import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Board, List } from "../../../shared/models";
import { ListHeader } from "@/components/list/ListHeader";
import { ListStatusBand } from "@/components/board/ListStatusBand";
import { cn } from "@/lib/utils";
import { statusBandSurfaceClass } from "./boardStatusUtils";

interface ListColumnBodyProps {
  board: Board;
  list: List;
  listId: string;
  visibleStatuses: string[];
  weights: number[];
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
}

function ListColumnBody({
  board,
  list,
  listId,
  visibleStatuses,
  weights,
  dragAttributes,
  dragListeners,
}: ListColumnBodyProps) {
  return (
    <>
      <ListHeader
        boardId={board.id}
        list={list}
        dragAttributes={dragAttributes}
        dragListeners={dragListeners}
      />
      <div className="flex min-h-0 flex-1 flex-col bg-transparent">
        {visibleStatuses.map((status, i) => (
          <div
            key={status}
            style={{
              flexGrow: weights[i] ?? 1,
              flexShrink: 1,
              flexBasis: 0,
              minHeight: 0,
            }}
            className={cn(
              "min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain p-2",
              statusBandSurfaceClass(status),
            )}
            data-board-id={board.id}
            data-list-id={listId}
            data-status={status}
            aria-label={`${list.name} — ${status}`}
          >
            <ListStatusBand board={board} list={list} status={status} />
          </div>
        ))}
      </div>
    </>
  );
}

export interface BoardListColumnOverlayProps {
  board: Board;
  listId: string;
  visibleStatuses: string[];
  weights: number[];
}

/** Full-fidelity column clone for DragOverlay. */
export function BoardListColumnOverlay({
  board,
  listId,
  visibleStatuses,
  weights,
}: BoardListColumnOverlayProps) {
  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;
  return (
    <div className="pointer-events-none flex h-full min-h-0 w-72 shrink-0 cursor-grabbing flex-col overflow-hidden rounded-lg border border-border bg-card opacity-90 shadow-xl ring-2 ring-primary/25">
      <ListColumnBody
        board={board}
        list={list}
        listId={listId}
        visibleStatuses={visibleStatuses}
        weights={weights}
      />
    </div>
  );
}

interface BoardListColumnProps {
  board: Board;
  listId: string;
  visibleStatuses: string[];
  weights: number[];
}

export function BoardListColumn({
  board,
  listId,
  visibleStatuses,
  weights,
}: BoardListColumnProps) {
  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex h-full min-h-0 w-72 shrink-0 flex-col"
      data-list-column={list.id}
    >
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-[opacity,border-color]",
          isDragging
            ? "border-2 border-dashed border-primary/20 bg-muted/30 shadow-none"
            : "border-border",
        )}
      >
        {!isDragging && (
          <ListColumnBody
            board={board}
            list={list}
            listId={listId}
            visibleStatuses={visibleStatuses}
            weights={weights}
            dragAttributes={attributes}
            dragListeners={listeners}
          />
        )}
      </div>
    </div>
  );
}
