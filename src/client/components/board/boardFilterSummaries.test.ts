import { describe, expect, test } from "vitest";
import { RELEASE_FILTER_UNTAGGED } from "../../../shared/boardFilters";
import { EMPTY_BOARD_CLI_POLICY } from "../../../shared/cliPolicy";
import type { Board, List } from "../../../shared/models";
import {
  boardHasClearableTaskFilters,
  buildBoardFilterSummaries,
} from "./boardFilterSummaries";
import type { TaskDateFilterResolved } from "./boardStatusUtils";

function listRow(listId: number): List {
  return { listId, name: `L${listId}`, order: listId };
}

function minimalBoard(overrides: Partial<Board> = {}): Board {
  return {
    boardId: 1,
    name: "B",
    description: "",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    taskGroups: [
      { groupId: 1, label: "Alpha", sortOrder: 0 },
      { groupId: 2, label: "Beta", sortOrder: 1 },
    ],
    defaultTaskGroupId: 1,
    deletedGroupFallbackId: 1,
    taskPriorities: [
      {
        priorityId: 1,
        value: 0,
        label: "none",
        color: "#fff",
        isSystem: true,
      },
      {
        priorityId: 10,
        value: 10,
        label: "low",
        color: "#94a3b8",
        isSystem: true,
      },
    ],
    releases: [
      { releaseId: 1, name: "R1", color: "#ff0000", createdAt: "2020-01-01T00:00:00.000Z" },
      { releaseId: 2, name: "R2", color: "#00ff00", createdAt: "2020-01-02T00:00:00.000Z" },
    ],
    defaultReleaseId: 1,
    autoAssignReleaseOnCreateUi: false,
    autoAssignReleaseOnCreateCli: false,
    visibleStatuses: ["open", "in-progress", "closed"],
    showStats: false,
    muteCelebrationSounds: false,
    lists: [listRow(1)],
    tasks: [],
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildBoardFilterSummaries", () => {
  test("single group label becomes summary chip", () => {
    const board = minimalBoard();
    const s = buildBoardFilterSummaries(board, ["1"], null, null, null);
    expect(s.group?.summary).toBe("Alpha");
  });

  test("multiple groups shows count chip and tooltip", () => {
    const board = minimalBoard();
    const s = buildBoardFilterSummaries(board, ["1", "2"], null, null, null);
    expect(s.group?.summary).toBe("(2 Groups)");
    expect(s.group?.tooltip).toContain("Alpha");
    expect(s.group?.tooltip).toContain("Beta");
  });

  test("untagged release shows Unassigned", () => {
    const board = minimalBoard();
    const s = buildBoardFilterSummaries(board, null, null, [RELEASE_FILTER_UNTAGGED], null);
    expect(s.release?.summary).toBe("Unassigned");
  });

  test("date filter includes mode label", () => {
    const board = minimalBoard();
    const df: TaskDateFilterResolved = {
      mode: "opened",
      startDate: "2025-06-01",
      endDate: "2025-06-01",
    };
    const s = buildBoardFilterSummaries(board, null, null, null, df);
    expect(s.dateSummary).toContain("·");
    expect(s.dateSummary).toContain("Opened");
  });

  test("defaultRelease resolves from board.defaultReleaseId", () => {
    const board = minimalBoard({ defaultReleaseId: 2 });
    const s = buildBoardFilterSummaries(board, null, null, null, null);
    expect(s.defaultRelease?.name).toBe("R2");
  });
});

describe("boardHasClearableTaskFilters", () => {
  test("false when all dimensions are default", () => {
    expect(boardHasClearableTaskFilters(null, null, null, null)).toBe(false);
  });

  test("true when a group is selected", () => {
    expect(boardHasClearableTaskFilters(["1"], null, null, null)).toBe(true);
  });

  test("true when priority filter is explicit (including empty)", () => {
    expect(boardHasClearableTaskFilters(null, [], null, null)).toBe(true);
    expect(boardHasClearableTaskFilters(null, ["10"], null, null)).toBe(true);
  });

  test("true when release filter is explicit", () => {
    expect(boardHasClearableTaskFilters(null, null, [], null)).toBe(true);
  });

  test("true when date filter is active", () => {
    const df: TaskDateFilterResolved = {
      mode: "any",
      startDate: "2025-06-01",
      endDate: "2025-06-01",
    };
    expect(boardHasClearableTaskFilters(null, null, null, df)).toBe(true);
  });
});
