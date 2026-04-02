import { memo, useCallback } from "react";
import type { Task, TaskPriorityDefinition } from "../../../shared/models";
import { useBoardKeyboardNavOptional } from "@/components/board/shortcuts/BoardKeyboardNavContext";
import { TaskCard } from "@/components/task/TaskCard";
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
  onOpen: () => void;
  editingTitle?: boolean;
  titleDraft?: string;
  onTitleDraftChange?: (value: string) => void;
  onTitleCommit?: () => void;
  onTitleCancel?: () => void;
  titleEditBusy?: boolean;
  onCompleteFromCircle?: () => void;
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
  onOpen,
  editingTitle = false,
  titleDraft,
  onTitleDraftChange,
  onTitleCommit,
  onTitleCancel,
  titleEditBusy = false,
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
      className={
        editingTitle
          ? "touch-none"
          : "cursor-grab touch-none select-none active:cursor-grabbing"
      }
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
        taskPriorities={taskPriorities}
        viewMode={viewMode}
        groupLabel={groupLabel}
        onOpen={onOpen}
        editingTitle={editingTitle}
        titleDraft={titleDraft}
        onTitleDraftChange={onTitleDraftChange}
        onTitleCommit={onTitleCommit}
        onTitleCancel={onTitleCancel}
        titleEditBusy={titleEditBusy}
        onCompleteFromCircle={onCompleteFromCircle}
        isDragging={isDragging}
        skipNavRegistration
      />
    </div>
  );
});
