/**
 * Min height for stacked list columns while dragging.
 * dnd-kit measures the sortable node for DragOverlay; without this, hiding the body
 * collapses the placeholder to a thin strip (lanes avoid this via h-full + row stretch).
 */
export const stackedListColumnMinHeightClass =
  "min-h-[max(12rem,min(70vh,calc(100dvh-11rem)))]";

/**
 * Shared DragOverlay chrome for full list-column clones (lanes + stacked).
 */
export const boardListColumnOverlayShellClass =
  "pointer-events-none flex max-h-[min(85vh,calc(100dvh-8rem))] min-h-[max(12rem,min(70vh,calc(100dvh-11rem)))] w-72 shrink-0 cursor-grabbing flex-col overflow-hidden rounded-lg border border-border bg-list-column opacity-90 shadow-xl ring-2 ring-primary/25";

/** Wrapper for task card while dragging. */
export const boardTaskDragOverlayClass =
  "w-72 cursor-grabbing rounded-md opacity-95 shadow-xl ring-2 ring-primary/20";
