import {
  groupDisplayLabelForId,
  type Board,
  type Task,
} from "../../../shared/models";
import { boardColumnSpreadProps } from "./boardColumnData";
import { TaskCard, taskReleasePill } from "@/components/task/TaskCard";
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
        releasePill={taskReleasePill(board, task)}
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
      tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
      visibleStatuses: string[];
    }
  | {
      board: Board;
      overlayTask: Task | undefined;
      activeListId: number | null;
      layout: "lanes";
      visibleStatuses: string[];
      weights: number[];
      tasksByListStatus: ReadonlyMap<string, readonly Task[]>;
    };

/** Renders the appropriate DragOverlay child for board DnD (task vs list column). */
export function BoardDragOverlayContent(props: BoardDragOverlayContentProps) {
  if (props.overlayTask) {
    return <BoardTaskDragOverlay board={props.board} task={props.overlayTask} />;
  }
  if (props.activeListId == null) return null;
  if (props.layout === "lanes") {
    const list = props.board.lists.find(
      (l) => l.id === props.activeListId,
    );
    if (!list) return null;
    return (
      <BoardListColumnOverlay
        {...boardColumnSpreadProps(props.board)}
        list={list}
        listId={props.activeListId}
        visibleStatuses={props.visibleStatuses}
        weights={props.weights}
        tasksByListStatus={props.tasksByListStatus}
      />
    );
  }
  const list = props.board.lists.find((l) => l.id === props.activeListId);
  if (!list) return null;
  return (
    <BoardListStackedColumnOverlay
      {...boardColumnSpreadProps(props.board)}
      list={list}
      listId={props.activeListId}
      tasksByListStatus={props.tasksByListStatus}
      visibleStatuses={props.visibleStatuses}
    />
  );
}
