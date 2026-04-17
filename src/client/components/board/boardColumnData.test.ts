import { describe, expect, test } from "vitest";
import { DEFAULT_BOARD_COLOR } from "../../../shared/boardColor";
import { EMPTY_BOARD_CLI_POLICY } from "../../../shared/cliPolicy";
import type { Board } from "../../../shared/models";
import {
  createDefaultTaskGroups,
  createDefaultTaskPriorities,
} from "../../../shared/models";
import { boardColumnSpreadProps, taskEditorBoardData } from "./boardColumnData";

function minimalBoard(overrides: Partial<Board> = {}): Board {
  const now = "2020-01-01T00:00:00.000Z";
  const groups = createDefaultTaskGroups();
  const g0 = groups[0]!.groupId;
  return {
    boardId: 42,
    name: "B",
    slug: "b",
    emoji: null,
    description: "",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    taskGroups: groups,
    defaultTaskGroupId: g0,
    deletedGroupFallbackId: g0,
    taskPriorities: createDefaultTaskPriorities(),
    releases: [],
    defaultReleaseId: 9,
    autoAssignReleaseOnCreateUi: false,
    autoAssignReleaseOnCreateCli: false,
    visibleStatuses: ["open", "closed"],
    boardLayout: "lanes",
    boardColor: DEFAULT_BOARD_COLOR,
    showStats: true,
    muteCelebrationSounds: false,
    lists: [],
    tasks: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("boardColumnData", () => {
  test("boardColumnSpreadProps maps core band fields and visible statuses", () => {
    const board = minimalBoard({
      boardId: 7,
      showStats: true,
      visibleStatuses: ["a", "b"],
    });
    const spread = boardColumnSpreadProps(board);
    expect(spread.boardId).toBe(7);
    expect(spread.showStats).toBe(true);
    expect(spread.boardVisibleStatuses).toEqual(["a", "b"]);
    expect(spread.boardTasks).toBe(board.tasks);
    expect(spread.taskGroups).toBe(board.taskGroups);
    expect(spread.defaultReleaseId).toBe(9);
  });

  test("taskEditorBoardData returns the TaskEditor subset without tasks or layout-only fields", () => {
    const board = minimalBoard({ boardId: 3 });
    const data = taskEditorBoardData(board);
    expect(data).toEqual({
      boardId: 3,
      taskGroups: board.taskGroups,
      taskPriorities: board.taskPriorities,
      releases: board.releases,
      defaultTaskGroupId: board.defaultTaskGroupId,
      defaultReleaseId: board.defaultReleaseId,
    });
  });
});
