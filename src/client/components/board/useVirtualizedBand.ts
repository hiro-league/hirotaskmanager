import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo } from "react";
import type { TaskCardViewMode } from "@/store/preferences";

const TASK_ROW_GAP_PX = 8;

function estimatedTaskRowHeight(viewMode: TaskCardViewMode): number {
  switch (viewMode) {
    case "small":
      return 68;
    case "normal":
      return 88;
    case "large":
      return 108;
    case "larger":
      return 132;
    default:
      return 96;
  }
}

interface UseVirtualizedBandOptions {
  count: number;
  itemIds: readonly number[];
  getScrollElement: () => HTMLElement | null;
  viewMode: TaskCardViewMode;
  overscan?: number;
  enabled?: boolean;
}

/**
 * Keep the board's logical task order intact while only mounting the rows that
 * are near the current scroll viewport (board perf plan #4).
 */
export function useVirtualizedBand({
  count,
  itemIds,
  getScrollElement,
  viewMode,
  overscan = 5,
  enabled = true,
}: UseVirtualizedBandOptions) {
  const shouldVirtualize = enabled && count > 0;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement,
    estimateSize: () => estimatedTaskRowHeight(viewMode),
    overscan,
    gap: TASK_ROW_GAP_PX,
    // Track measurements by task id, not index. Without this, a filter change
    // that shuffles which task sits at each index reuses the old task's cached
    // height for the new task, producing wrong translateY values until re-measure.
    getItemKey: (index) => itemIds[index] ?? index,
  });

  const taskIndexById = useMemo(() => {
    const out = new Map<number, number>();
    itemIds.forEach((taskId, index) => {
      out.set(taskId, index);
    });
    return out;
  }, [itemIds]);

  const revealTask = useCallback(
    (taskId: number) => {
      if (!shouldVirtualize) return false;
      const index = taskIndexById.get(taskId);
      if (index == null) return false;
      virtualizer.scrollToIndex(index, { align: "auto" });
      return true;
    },
    [shouldVirtualize, taskIndexById, virtualizer],
  );

  return {
    shouldVirtualize,
    virtualItems: shouldVirtualize ? virtualizer.getVirtualItems() : [],
    totalSize: shouldVirtualize ? virtualizer.getTotalSize() : 0,
    measureElement: virtualizer.measureElement,
    revealTask,
  };
}
