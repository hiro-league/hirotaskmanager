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
import { boardListColumnOverlayShellClass } from "./boardDragOverlayShell";
import { laneBandContainerId, sortableListId } from "./dndIds";

interface ListColumnBodyProps {
  board: Board;
  list: List;
  listId: number;
  visibleStatuses: string[];
  weights: number[];
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  taskMap?: Record<string, string[]>;
}

function ListColumnBody({
  board,
  list,
  listId,
  visibleStatuses,
  weights,
  dragAttributes,
  dragListeners,
  taskMap,
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
        {visibleStatuses.map((status, i) => {
          const containerId = laneBandContainerId(listId, status);
          const sortableIds = taskMap?.[containerId];
          return (
            <div
              key={status}
              style={{
                flexGrow: weights[i] ?? 1,
                flexShrink: 1,
                flexBasis: 0,
                minHeight: 0,
              }}
              className={cn(
                "flex min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain p-2",
                "bg-muted/20 dark:bg-muted/10",
              )}
              data-board-id={board.id}
              data-list-id={listId}
              data-status={status}
              aria-label={`${list.name} — ${status}`}
            >
              <ListStatusBand
                board={board}
                list={list}
                status={status}
                containerId={sortableIds != null ? containerId : undefined}
                sortableIds={sortableIds}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

export interface BoardListColumnOverlayProps {
  board: Board;
  listId: number;
  visibleStatuses: string[];
  weights: number[];
}

export function BoardListColumnOverlay({
  board,
  listId,
  visibleStatuses,
  weights,
}: BoardListColumnOverlayProps) {
  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;
  return (
    <div className={boardListColumnOverlayShellClass}>
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
  listId: number;
  visibleStatuses: string[];
  weights: number[];
  taskMap?: Record<string, string[]>;
}

export function BoardListColumn({
  board,
  listId,
  visibleStatuses,
  weights,
  taskMap,
}: BoardListColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableListId(listId) });

  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;

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
      data-board-no-pan
    >
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
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
            taskMap={taskMap}
          />
        )}
      </div>
    </div>
  );
}
