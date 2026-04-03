import {
  groupDisplayLabelForId,
  type Board,
  type Task,
} from "../../../shared/models";
import { TaskCard } from "@/components/task/TaskCard";
import { useResolvedTaskCardViewMode } from "@/store/preferences";
import { boardTaskDragOverlayClass } from "./boardDragOverlayShell";
import { BoardListColumnOverlay } from "./BoardListColumn";
import { BoardListStackedColumnOverlay } from "./BoardListStackedColumn";

export function BoardTaskDragOverlay({
  board,
  task,
}: {
  board: Board;
  task: Task;
}) {
  const taskCardViewMode = useResolvedTaskCardViewMode(board.id);
  return (
    <div className={boardTaskDragOverlayClass}>
      <TaskCard
        task={task}
        taskPriorities={board.taskPriorities}
        viewMode={taskCardViewMode}
        groupLabel={groupDisplayLabelForId(board.taskGroups, task.groupId)}
        onOpen={() => {}}
      />
    </div>
  );
}

export type BoardDragOverlayContentProps =
  | {
      board: Board;
      overlayTask: Task | undefined;
      activeListId: number | null;
      layout: "stacked";
    }
  | {
      board: Board;
      overlayTask: Task | undefined;
      activeListId: number | null;
      layout: "lanes";
      visibleStatuses: string[];
      weights: number[];
    };

/** Renders the appropriate DragOverlay child for board DnD (task vs list column). */
export function BoardDragOverlayContent(props: BoardDragOverlayContentProps) {
  if (props.overlayTask) {
    return <BoardTaskDragOverlay board={props.board} task={props.overlayTask} />;
  }
  if (props.activeListId == null) return null;
  if (props.layout === "lanes") {
    return (
      <BoardListColumnOverlay
        board={props.board}
        listId={props.activeListId}
        visibleStatuses={props.visibleStatuses}
        weights={props.weights}
      />
    );
  }
  return (
    <BoardListStackedColumnOverlay
      board={props.board}
      listId={props.activeListId}
    />
  );
}
