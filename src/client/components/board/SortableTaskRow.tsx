import { memo, useCallback } from "react";
import type { Task } from "../../../shared/models";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { TaskCard } from "@/components/task/TaskCard";
import type { TaskCardViewMode } from "@/store/preferences";
import { useBoardTaskSortableReact } from "./useBoardTaskSortableReact";

export interface SortableTaskRowProps {
  sortableId: string;
  containerId: string;
  index: number;
  task: Task;
  viewMode: TaskCardViewMode;
  groupLabel: string;
  onOpen: () => void;
  onCompleteFromCircle?: () => void;
}

// Memoized: only re-renders when its own props change, not on sibling reorders
export const SortableTaskRow = memo(function SortableTaskRow({
  sortableId,
  containerId,
  index,
  task,
  viewMode,
  groupLabel,
  onOpen,
  onCompleteFromCircle,
}: SortableTaskRowProps) {
  const {
    ref: setSortableNodeRef,
    isDragging,
  } = useBoardTaskSortableReact(task.id, sortableId, containerId, index);
  const nav = useBoardKeyboardNavOptional();
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setSortableNodeRef(node);
      nav?.registerTaskElement(task.id, node);
    },
    [setSortableNodeRef, nav, task.id],
  );
  return (
    <div
      ref={setNodeRef}
      className="cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || isDragging) return;
        nav?.setHoveredTaskId(task.id);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        nav?.setHoveredTaskId(null);
      }}
    >
      <TaskCard
        task={task}
        viewMode={viewMode}
        groupLabel={groupLabel}
        onOpen={onOpen}
        onCompleteFromCircle={onCompleteFromCircle}
        isDragging={isDragging}
        skipNavRegistration
      />
    </div>
  );
});
