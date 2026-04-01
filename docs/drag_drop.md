# Drag & Drop — Patterns and Gotchas

Reference for implementing DnD features in this project using the React-first **@dnd-kit/react** stack and **@dnd-kit/helpers**.

---

## Architecture overview

| Layer | Role |
|---|---|
| `DragDropProvider` | Wraps the drag region and owns drag event handlers. |
| `useSortable` | Per-item hook for sortable columns or tasks. |
| `useDroppable` | Explicit container hook for empty-drop targets and non-sortable bands. |
| `DragOverlay` | Portal-rendered floating clone that follows the pointer. |

## Key patterns we use

### 1. Optimistic local reorder (not transform-based)

Instead of relying on `useSortable` transforms to preview the new order, we **reorder the items array in state** during `onDragOver`:

```ts
const handleDragOver = (event) => {
  setLocalIds((prev) => {
    const oldIndex = prev.indexOf(activeId);
    const newIndex = prev.indexOf(overId);
    return arrayMove(prev, oldIndex, newIndex);
  });
};
```

React re-renders with the new DOM order — flexbox handles positioning naturally. This avoids transform ↔ layout fights that cause jump artifacts.

### 2. DragOverlay for the floating clone

The dragged item's in-flow node stays as a **placeholder** (dashed border, empty). A separate `<DragOverlay>` renders a visual clone at the pointer position. This decouples the visual drag from the layout.

```tsx
<DragOverlay dropAnimation={null} zIndex={60}>
  {activeId ? <ItemOverlay id={activeId} /> : null}
</DragOverlay>
```

### 3. Refs for live state in callbacks

`useCallback` closures capture stale state. Any value that changes during a drag and is read in `onDragEnd` must use a **ref**:

```ts
const localIdsRef = useRef(localIds);
localIdsRef.current = localIds;

const handleDragEnd = useCallback(() => {
  const finalOrder = localIdsRef.current; // always fresh
  persist(finalOrder);
}, [persist]);
```

### 4. Guard against reset-during-drag

If server data arrives mid-drag and triggers a state sync, it can overwrite the local reorder. Use a ref flag:

```ts
const isDraggingRef = useRef(false);

useEffect(() => {
  if (!isDraggingRef.current) {
    setLocalIds(serverIds);
  }
}, [serverIds]);
```

Do **not** derive `isDragging` from state (`activeId != null`) for this guard — setting `activeId` to `null` in `onDragEnd` would trigger the effect before the mutation fires.

---

## Common gotchas

### `over` is `null` on drop with DragOverlay

When using `DragOverlay`, the pointer is often over the overlay (not a droppable) at release. Mitigations:

- Use `pointerWithin` as primary collision detection (falls through to `closestCenter`).
- Track `lastOverId` in `onDragOver` as a fallback.
- Or use the optimistic-reorder pattern above — you don't need `over` at all in `onDragEnd` since the array is already reordered.

### Sibling "snap-back" on drop

Caused by transforms clearing at the same time React reorders the DOM. The optimistic-reorder pattern eliminates this entirely since siblings are never transformed — they're already in the correct DOM position.

### `dropAnimation` flying to wrong position

The default drop animation measures the source node's rect, but if it's hidden (`opacity: 0`) or has been moved by layout changes, the animation targets a wrong position. Set `dropAnimation={null}` when using optimistic reorder — the overlay just disappears and the item is already in place.

### `overflow: hidden` clips absolutely-positioned indicators

If you need a drop indicator (bar, highlight) that extends outside the item's bounds, use a two-div structure:

```
outer div (sortable ref, no overflow clipping, position: relative)
  ├── drop indicator (absolute, can extend into gap)
  └── inner div (overflow-hidden, rounded, border — the visual card)
```

### Drag handle vs full-item drag

To drag from a specific handle (e.g. header), pass `attributes` and `listeners` from `useSortable` to only the handle element, not the root ref:

```tsx
<div ref={setNodeRef}> {/* sortable root — not draggable itself */}
  <Header {...attributes} {...listeners} /> {/* drag handle */}
  <Body />
</div>
```

### Tap vs drag on the same element

If the drag handle is also tappable (e.g. tap-to-rename), track pointer movement and only trigger tap if displacement < threshold:

```ts
onPointerDown → record start position
onPointerMove → if distance > threshold, mark as moved
onPointerUp → if not moved, fire tap action
```

Wire this into the sortable listeners by merging/wrapping them.

---

## Collision detection

| Strategy | Best for |
|---|---|
| `closestCenter` | Default, works for most grid/list layouts |
| `pointerWithin` | Better with DragOverlay — checks what's under the pointer |
| Custom composite | `pointerWithin` first, fall back to `closestCenter` |

```ts
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};
```

## Measuring

For items inside a scroll container, use `MeasuringStrategy.Always` so droppable rects stay accurate as the container scrolls:

```tsx
<DndContext measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}>
```

---

## Checklist for adding a new sortable group

1. **State**: local array of ids + ref mirror + `isDraggingRef` guard
2. **SortableContext**: pass the local array as `items`
3. **Per-item**: `useSortable` hook, `setNodeRef` on outer div, `transform`/`transition` in style (only when not dragging)
4. **DragOverlay**: render a visual clone; set `dropAnimation={null}`
5. **onDragStart**: set `activeId`, set `isDraggingRef = true`
6. **onDragOver**: `arrayMove` the local array
7. **onDragEnd**: read final order from ref, persist, clear `activeId`, set `isDraggingRef = false`
8. **onDragCancel**: reset local array to server state, clear `activeId`
9. **Placeholder**: style the in-flow node when `isDragging` (dashed border, muted bg, hide content)
