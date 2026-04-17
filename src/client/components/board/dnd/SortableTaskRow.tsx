import { memo, useCallback } from "react";
import type { Task, TaskPriorityDefinition } from "../../../../shared/models";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import {
  TaskCard,
  type TaskCardInlineEdit,
} from "@/components/task/TaskCard";
import type { TaskCardViewMode } from "@/store/preferences";
import { useBoardTaskSortableReact } from "./useBoardTaskSortableReact";

export interface SortableTaskRowProps {
  sortableId: string;
  containerId: string;
  index: number;
  task: Task;
  taskPriorities: TaskPriorityDefinition[];
  viewMode: TaskCardViewMode;
  groupLabel: string;
  releasePill?: { label: string; color?: string | null } | null;
  onOpen: () => void;
  inlineEdit?: TaskCardInlineEdit;
  onCompleteFromCircle?: (anchorEl: HTMLElement) => void;
}

// Memoized: only re-renders when its own props change, not on sibling reorders
export const SortableTaskRow = memo(function SortableTaskRow({
  sortableId,
  containerId,
  index,
  task,
  taskPriorities,
  viewMode,
  groupLabel,
  releasePill = null,
  onOpen,
  inlineEdit,
  onCompleteFromCircle,
}: SortableTaskRowProps) {
  const {
    ref: setSortableNodeRef,
    isDragging,
  } = useBoardTaskSortableReact(task.taskId, sortableId, containerId, index);
  const nav = useBoardKeyboardNavOptional();
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setSortableNodeRef(node);
      nav?.registerTaskElement(task.taskId, node);
    },
    [setSortableNodeRef, nav, task.taskId],
  );
  return (
    <div
      ref={setNodeRef}
      className={
        inlineEdit != null
          ? "touch-none"
          : "cursor-grab touch-none select-none active:cursor-grabbing"
      }
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || isDragging) return;
        nav?.setHoveredTaskId(task.taskId);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        nav?.setHoveredTaskId(null);
      }}
    >
      <TaskCard
        task={task}
        taskPriorities={taskPriorities}
        viewMode={viewMode}
        groupLabel={groupLabel}
        releasePill={releasePill}
        onOpen={onOpen}
        inlineEdit={inlineEdit}
        onCompleteFromCircle={onCompleteFromCircle}
        isDragging={isDragging}
        skipNavRegistration
      />
    </div>
  );
});
