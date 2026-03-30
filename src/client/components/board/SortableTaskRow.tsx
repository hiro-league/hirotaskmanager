import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { Task } from "../../../shared/models";
import { TaskCard } from "@/components/task/TaskCard";

interface SortableTaskRowProps {
  sortableId: string;
  task: Task;
  groupLabel: string;
  onOpen: () => void;
  onCompleteFromCircle?: () => void;
}

export function SortableTaskRow({
  sortableId,
  task,
  groupLabel,
  onOpen,
  onCompleteFromCircle,
}: SortableTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="cursor-grab touch-none active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <TaskCard
        task={task}
        groupLabel={groupLabel}
        onOpen={onOpen}
        onCompleteFromCircle={onCompleteFromCircle}
        isDragging={isDragging}
      />
    </div>
  );
}
