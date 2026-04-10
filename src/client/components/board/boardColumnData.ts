import type { Board, Task } from "../../../shared/models";

/**
 * Core board fields for list **bands** (tasks, editor, mutations) — no `showStats`
 * (list shell / `ListColumnBody` only). Spread as individual props for `React.memo`
 * (board perf plan #2).
 */
export type BoardBandSpreadProps = {
  boardId: number;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  releases: Board["releases"];
  defaultTaskGroupId: number;
  boardTasks: readonly Task[];
};

/** Column body = band fields plus `showStats` and status visibility prefs. */
export type BoardColumnSpreadProps = BoardBandSpreadProps & {
  showStats: boolean;
  /** `board.visibleStatuses` — paired with workflow order in stacked columns. */
  boardVisibleStatuses: readonly string[];
};

export function boardColumnSpreadProps(board: Board): BoardColumnSpreadProps {
  return {
    boardId: board.boardId,
    showStats: board.showStats,
    taskGroups: board.taskGroups,
    taskPriorities: board.taskPriorities,
    releases: board.releases,
    defaultTaskGroupId: board.defaultTaskGroupId,
    boardTasks: board.tasks,
    boardVisibleStatuses: board.visibleStatuses,
  };
}

/** Subset passed into `TaskEditor` from column components (same stability goals as above). */
export type TaskEditorBoardData = Pick<
  Board,
  | "boardId"
  | "taskGroups"
  | "taskPriorities"
  | "releases"
  | "defaultTaskGroupId"
>;

export function taskEditorBoardData(board: Board): TaskEditorBoardData {
  return {
    boardId: board.boardId,
    taskGroups: board.taskGroups,
    taskPriorities: board.taskPriorities,
    releases: board.releases,
    defaultTaskGroupId: board.defaultTaskGroupId,
  };
}
