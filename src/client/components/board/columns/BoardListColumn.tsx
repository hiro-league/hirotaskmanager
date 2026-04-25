import { memo, useCallback, useLayoutEffect, useRef, type RefCallback } from "react";
import { listDisplayName, type List, type Task } from "../../../../shared/models";
import type { BoardColumnSpreadProps } from "../boardColumnData";
import { ListStatsChipsRow } from "@/components/board/header/BoardStatsChips";
import { useBoardStatsDisplayOptional } from "@/components/board/BoardStatsContext";
import { ListHeader } from "@/components/list/ListHeader";
import { ListStatusBand } from "@/components/board/lanes/ListStatusBand";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { cn } from "@/lib/utils";
import { boardListColumnOverlayShellClass } from "../dnd/boardDragOverlayShell";
import { laneBandContainerId } from "../dnd/dndIds";
import { laneStatusDividerClass } from "../lanes/laneStatusTheme";
import { isOptimisticListId } from "@/api/mutations/shared";
import { useBoardColumnSortableReact } from "../dnd/useBoardColumnSortableReact";
import { useColumnInViewport } from "../lanes/useColumnInViewport";
import { ListColumnCreatingOverlay } from "./ListColumnCreatingOverlay";

interface ListColumnBodyProps extends BoardColumnSpreadProps {
  list: List;
  listId: number;
  visibleStatuses: string[];
  weights: number[];
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
  dragHandleRef?: RefCallback<HTMLElement>;
  taskMap?: Record<string, string[]>;
  isTaskDragActive?: boolean;
}

function ListColumnBody({
  boardId,
  boardSlug,
  showStats,
  taskGroups,
  taskPriorities,
  releases,
  defaultTaskGroupId,
  defaultReleaseId,
  boardLists,
  boardTasks,
  boardVisibleStatuses,
  list,
  listId,
  visibleStatuses,
  weights,
  tasksByListStatus,
  dragHandleRef,
  taskMap,
  isTaskDragActive = false,
}: ListColumnBodyProps) {
  void boardVisibleStatuses; // lanes shell does not need prefs; prop kept for memo key parity with stacked spread
  const bandsRef = useRef<HTMLDivElement>(null);
  const bandHeightsRef = useRef<number[]>([]);
  const isTaskDragActiveRef = useRef(isTaskDragActive);
  isTaskDragActiveRef.current = isTaskDragActive;
  const boardStatsDisplay = useBoardStatsDisplayOptional();

  // Snapshot band heights when layout can change (not on every commit — §2.1). ResizeObserver
  // covers window resize; ref gate skips updates during task drag when we use frozen heights.
  useLayoutEffect(() => {
    const el = bandsRef.current;
    if (!el) return;

    const snapshot = () => {
      if (isTaskDragActiveRef.current) return;
      bandHeightsRef.current = Array.from(el.children).map(
        (c) => (c as HTMLElement).getBoundingClientRect().height,
      );
    };

    snapshot();
    const ro = new ResizeObserver(snapshot);
    ro.observe(el);
    return () => ro.disconnect();
  }, [weights, visibleStatuses, listId]);

  useLayoutEffect(() => {
    if (isTaskDragActive) return;
    const el = bandsRef.current;
    if (!el) return;
    bandHeightsRef.current = Array.from(el.children).map(
      (c) => (c as HTMLElement).getBoundingClientRect().height,
    );
  }, [isTaskDragActive]);

  const listStatsRow =
    showStats &&
    boardStatsDisplay != null &&
    !boardStatsDisplay.statsError ? (
      <ListStatsChipsRow
        stats={boardStatsDisplay.listStat(listId)}
        showSpinner={boardStatsDisplay.showChipSpinner}
        entryToken={boardStatsDisplay.entryToken}
      />
    ) : null;

  return (
    <>
      <ListHeader
        boardId={boardId}
        list={list}
        dragHandleRef={dragHandleRef}
      />
      {listStatsRow}
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
                // Non-open bands also keep scrolling inside `ListStatusBand` so
                // each band can own its virtualizer viewport.
                "overflow-hidden",
                isOpenBand && "relative",
              )}
              data-board-id={boardId}
              data-list-id={listId}
              data-status={status}
              aria-label={`${listDisplayName(list)} — ${status}`}
            >
              <ListStatusBand
                boardId={boardId}
                boardSlug={boardSlug}
                taskGroups={taskGroups}
                taskPriorities={taskPriorities}
                releases={releases}
                defaultTaskGroupId={defaultTaskGroupId}
                defaultReleaseId={defaultReleaseId}
                boardLists={boardLists}
                boardTasks={boardTasks}
                list={list}
                status={status}
                tasksByListStatus={tasksByListStatus}
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

export interface BoardListColumnOverlayProps
  extends BoardColumnSpreadProps {
  list: List;
  listId: number;
  visibleStatuses: string[];
  weights: number[];
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
}

export function BoardListColumnOverlay({
  list,
  listId,
  visibleStatuses,
  weights,
  tasksByListStatus,
  ...columnSpread
}: BoardListColumnOverlayProps) {
  return (
    <div className={boardListColumnOverlayShellClass}>
      <ListColumnBody
        {...columnSpread}
        list={list}
        listId={listId}
        visibleStatuses={visibleStatuses}
        weights={weights}
        tasksByListStatus={tasksByListStatus}
      />
    </div>
  );
}

interface BoardListColumnProps extends BoardColumnSpreadProps {
  list: List;
  listId: number;
  listIndex: number;
  visibleStatuses: string[];
  weights: number[];
  tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
  taskMap?: Record<string, string[]>;
  isTaskDragActive?: boolean;
}

// Memoized: only re-renders when this column's props actually change
export const BoardListColumn = memo(function BoardListColumn({
  list,
  listId,
  listIndex,
  visibleStatuses,
  weights,
  tasksByListStatus,
  taskMap,
  isTaskDragActive,
  ...columnSpread
}: BoardListColumnProps) {
  const { ref, handleRef, isDragging } = useBoardColumnSortableReact(
    listId,
    listIndex,
  );

  // Skip rendering the heavy task body for columns scrolled off-screen
  // horizontally so only visible columns pay the sortable/virtualizer cost
  // (board perf plan #4 — horizontal column gating).
  const { columnRef: viewportRef, inViewport } = useColumnInViewport(!isDragging);

  const boardNav = useBoardKeyboardNavOptional();
  const listColumnShellRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!boardNav) return;
    const el = listColumnShellRef.current;
    boardNav.registerListElement(list.listId, el);
    return () => boardNav.registerListElement(list.listId, null);
  }, [boardNav, list]);

  const mergedOuterRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref(node);
      (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref, viewportRef],
  );

  const listIsOptimistic = isOptimisticListId(listId);

  return (
    <div
      ref={mergedOuterRef}
      className="relative flex h-full min-h-0 w-72 shrink-0 flex-col"
      data-list-column={list.listId}
      data-board-no-pan
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || isDragging || !boardNav) return;
        boardNav.setHoveredListId(list.listId);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse" || !boardNav) return;
        boardNav.setHoveredListId(null);
      }}
    >
      <div
        ref={listColumnShellRef}
        aria-busy={listIsOptimistic}
        className={cn(
          "group/list-col relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-list-column shadow-sm transition-[opacity,border-color]",
          isDragging
            ? "border-2 border-dashed border-primary/20 bg-muted/30 shadow-none"
            : "border-border",
          listIsOptimistic && "opacity-70",
        )}
        onPointerDown={(e) => {
          if (!boardNav || isDragging) return;
          const target = e.target;
          if (!(target instanceof Element)) return;
          if (target.closest("[data-task-card-root],button,input,textarea,[role=menu],[role=menuitem]")) {
            return;
          }
          boardNav.selectList(list.listId);
        }}
      >
        <ListColumnCreatingOverlay show={listIsOptimistic} />
        {!isDragging && inViewport && (
          <ListColumnBody
            {...columnSpread}
            list={list}
            listId={listId}
            visibleStatuses={visibleStatuses}
            weights={weights}
            tasksByListStatus={tasksByListStatus}
            dragHandleRef={handleRef}
            taskMap={taskMap}
            isTaskDragActive={isTaskDragActive}
          />
        )}
        {!isDragging && !inViewport && (
          <ListHeader
            boardId={columnSpread.boardId}
            list={list}
            dragHandleRef={handleRef}
          />
        )}
      </div>
    </div>
  );
});
