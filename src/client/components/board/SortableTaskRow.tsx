import { memo, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { Task } from "../../../shared/models";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { TaskCard } from "@/components/task/TaskCard";

interface SortableTaskRowProps {
  sortableId: string;
  task: Task;
  groupLabel: string;
  onOpen: () => void;
  onCompleteFromCircle?: () => void;
}

// Memoized: only re-renders when its own props change, not on sibling reorders
export const SortableTaskRow = memo(function SortableTaskRow({
  sortableId,
  task,
  groupLabel,
  onOpen,
  onCompleteFromCircle,
}: SortableTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });
  const nav = useBoardKeyboardNavOptional();
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setSortableNodeRef(node);
      nav?.registerTaskElement(task.id, node);
    },
    [setSortableNodeRef, nav, task.id],
  );
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || isDragging) return;
        nav?.setHoveredTaskId(task.id);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        nav?.setHoveredTaskId(null);
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard
        task={task}
        groupLabel={groupLabel}
        onOpen={onOpen}
        onCompleteFromCircle={onCompleteFromCircle}
        isDragging={isDragging}
        skipNavRegistration
      />
    </div>
  );
});
