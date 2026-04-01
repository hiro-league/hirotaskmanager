import { memo, useLayoutEffect, useRef, type RefCallback } from "react";
import type { Board, List } from "../../../shared/models";
import { ListHeader } from "@/components/list/ListHeader";
import { ListStatusBand } from "@/components/board/ListStatusBand";
import { cn } from "@/lib/utils";
import { boardListColumnOverlayShellClass } from "./boardDragOverlayShell";
import { laneBandContainerId } from "./dndIds";
import { laneStatusDividerClass } from "./laneStatusTheme";
import { useBoardColumnSortableReact } from "./useBoardColumnSortableReact";

interface ListColumnBodyProps {
  board: Board;
  list: List;
  listId: number;
  visibleStatuses: string[];
  weights: number[];
  dragHandleRef?: RefCallback<HTMLElement>;
  taskMap?: Record<string, string[]>;
  isTaskDragActive?: boolean;
}

function ListColumnBody({
  board,
  list,
  listId,
  visibleStatuses,
  weights,
  dragHandleRef,
  taskMap,
  isTaskDragActive = false,
}: ListColumnBodyProps) {
  const bandsRef = useRef<HTMLDivElement>(null);
  const bandHeightsRef = useRef<number[]>([]);

  // Snapshot band heights after every non-dragging paint so we can freeze
  // them the moment a task drag begins, preventing flex-grow reflow from
  // triggering dnd-kit measureRect → setState infinite loops.
  useLayoutEffect(() => {
    if (!isTaskDragActive && bandsRef.current) {
      bandHeightsRef.current = Array.from(bandsRef.current.children).map(
        (el) => (el as HTMLElement).getBoundingClientRect().height,
      );
    }
  });

  return (
    <>
      <ListHeader
        boardId={board.id}
        list={list}
        dragHandleRef={dragHandleRef}
      />
      <div ref={bandsRef} className="flex min-h-0 flex-1 flex-col bg-transparent">
        {visibleStatuses.map((status, i) => {
          const containerId = laneBandContainerId(listId, status);
          const sortableIds = taskMap?.[containerId];
          const isOpenBand = status === "open";
          const frozenH = isTaskDragActive ? bandHeightsRef.current[i] : undefined;
          return (
            <div
              key={status}
              style={
                frozenH != null
                  ? { height: frozenH, minHeight: 0 }
                  : {
                      flexGrow: weights[i] ?? 1,
                      flexShrink: 1,
                      flexBasis: 0,
                      minHeight: 0,
                    }
              }
              className={cn(
                "flex min-h-0 flex-col",
                // Keep list bodies neutral; only the left status rail carries the accent color.
                i > 0 &&
                  cn(
                    "border-t-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)]",
                    laneStatusDividerClass(status),
                  ),
                // Open band: relative + overflow-hidden so the FAB (absolute sibling
                // of the inner scroll div) is clipped to this band's visible area.
                // Non-open bands: scroll is handled here directly.
                isOpenBand
                  ? "relative overflow-hidden"
                  : "overflow-x-hidden overflow-y-auto overscroll-y-contain p-2",
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
  listIndex: number;
  visibleStatuses: string[];
  weights: number[];
  taskMap?: Record<string, string[]>;
  isTaskDragActive?: boolean;
}

// Memoized: only re-renders when this column's props actually change
export const BoardListColumn = memo(function BoardListColumn({
  board,
  listId,
  listIndex,
  visibleStatuses,
  weights,
  taskMap,
  isTaskDragActive,
}: BoardListColumnProps) {
  const { ref, handleRef, isDragging } = useBoardColumnSortableReact(
    listId,
    listIndex,
  );

  const list = board.lists.find((l) => l.id === listId);
  if (!list) return null;

  return (
    <div
      ref={ref}
      className="relative flex h-full min-h-0 w-72 shrink-0 flex-col"
      data-list-column={list.id}
      data-board-no-pan
    >
      {/* group/list-col: FAB in the open band uses group-hover/list-col to
          appear only when the pointer is anywhere over this list column. */}
      <div
        className={cn(
          "group/list-col flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
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
            dragHandleRef={handleRef}
            taskMap={taskMap}
            isTaskDragActive={isTaskDragActive}
          />
        )}
      </div>
    </div>
  );
});
