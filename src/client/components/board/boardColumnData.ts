import type { Board, Task } from "../../../shared/models";

/**
 * Core board fields for list **bands** (tasks, editor, mutations) — no `showStats`
 * (list shell / `ListColumnBody` only). Spread as individual props for `React.memo`
 * (board perf plan #2).
 */
/** URL slug for routing and agent prompts, or stringified {@link Board.boardId} when slug is unset. */
export function boardSlugForPrompt(board: {
  boardId: number;
  slug?: string;
}): string {
  const s = board.slug?.trim();
  return s && s.length > 0 ? s : String(board.boardId);
}

export type BoardBandSpreadProps = {
  boardId: number;
  /** Resolved for deep links / agent prompts (slug or numeric id). */
  boardSlug: string;
  taskGroups: Board["taskGroups"];
  taskPriorities: Board["taskPriorities"];
  releases: Board["releases"];
  defaultTaskGroupId: number;
  defaultReleaseId: number | null;
  /** All lists on the board (for task overflow “move to list”, etc.). */
  boardLists: Board["lists"];
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
    boardSlug: boardSlugForPrompt(board),
    showStats: board.showStats,
    taskGroups: board.taskGroups,
    taskPriorities: board.taskPriorities,
    releases: board.releases,
    defaultTaskGroupId: board.defaultTaskGroupId,
    defaultReleaseId: board.defaultReleaseId,
    boardLists: board.lists,
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
  | "defaultReleaseId"
> & {
  boardSlug: string;
};

export function taskEditorBoardData(board: Board): TaskEditorBoardData {
  return {
    boardId: board.boardId,
    taskGroups: board.taskGroups,
    taskPriorities: board.taskPriorities,
    releases: board.releases,
    defaultTaskGroupId: board.defaultTaskGroupId,
    defaultReleaseId: board.defaultReleaseId,
    boardSlug: boardSlugForPrompt(board),
  };
}

/** Board slice for task card overflow (editor fields + lists/tasks for moves). */
export type TaskCardOverflowBoardData = TaskEditorBoardData & {
  lists: Board["lists"];
  /** Readonly: column spread uses `readonly Task[]` for memo stability. */
  tasks: readonly Task[];
};

export function taskCardOverflowBoardData(board: Board): TaskCardOverflowBoardData {
  return {
    ...taskEditorBoardData(board),
    lists: board.lists,
    tasks: board.tasks,
  };
}
