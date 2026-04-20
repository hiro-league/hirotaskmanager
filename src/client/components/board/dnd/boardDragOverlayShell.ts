/**
 * Shared DragOverlay chrome for full list-column clones (lanes + stacked).
 *
 * Task #31336: dropped the previous `min-h-[max(12rem,min(70vh,calc(100dvh-11rem)))]`
 * floor so the floating clone matches the actual list's rendered height instead of
 * always inflating to ~70vh. The `max-h` cap stays so very long lists still fit on
 * screen while being dragged.
 */
export const boardListColumnOverlayShellClass =
  "pointer-events-none flex max-h-[min(85vh,calc(100dvh-8rem))] w-72 shrink-0 cursor-grabbing flex-col overflow-hidden rounded-lg border border-border bg-list-column opacity-90 shadow-xl ring-2 ring-primary/25";

/** Wrapper for task card while dragging. */
export const boardTaskDragOverlayClass =
  "w-72 cursor-grabbing rounded-md opacity-95 shadow-xl ring-2 ring-primary/20";
