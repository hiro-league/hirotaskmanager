import { describe, expect, test } from "bun:test";
import { EMPTY_BOARD_CLI_POLICY } from "./cliPolicy";
import type { Board, List, Status, Task } from "./models";
import { RELEASE_FILTER_UNTAGGED } from "./boardFilters";
import {
  boardStatsFilterSignature,
  buildBoardStatsSearchParams,
  closedStatusIdsFromStatuses,
  computeBoardStats,
  parseBoardStatsFilter,
  type BoardStatsFilter,
} from "./boardStats";

const iso = (d: string) => new Date(d).toISOString();

function task(
  p: Partial<Task> & Pick<Task, "taskId" | "listId" | "status">,
): Task {
  return {
    title: "",
    body: "",
    groupId: 0,
    priorityId: 10,
    order: 0,
    createdAt: iso("2025-06-01T12:00:00Z"),
    updatedAt: iso("2025-06-01T12:00:00Z"),
    ...p,
  };
}

function listRow(listId: number): List {
  return { listId, name: `L${listId}`, order: listId };
}

function minimalBoard(overrides: Partial<Board> = {}): Board {
  return {
    boardId: 1,
    name: "B",
    description: "",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    taskGroups: [{ groupId: 0, label: "g", sortOrder: 0 }],
    defaultTaskGroupId: 0,
    deletedGroupFallbackId: 0,
    taskPriorities: [
      {
        priorityId: 1,
        value: 0,
        label: "none",
        color: "#ffffff",
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
    releases: [],
    defaultReleaseId: null,
    autoAssignReleaseOnCreateUi: false,
    autoAssignReleaseOnCreateCli: false,
    visibleStatuses: ["open", "in-progress", "closed"],
    showStats: false,
    muteCelebrationSounds: false,
    lists: [listRow(1)],
    tasks: [],
    createdAt: iso("2025-01-01T00:00:00Z"),
    updatedAt: iso("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

const workflowThree: Status[] = [
  { statusId: "open", label: "Open", sortOrder: 0, isClosed: false },
  {
    statusId: "in-progress",
    label: "In progress",
    sortOrder: 1,
    isClosed: false,
  },
  { statusId: "closed", label: "Closed", sortOrder: 2, isClosed: true },
];

describe("computeBoardStats", () => {
  test("empty board: zeros for board and every list", () => {
    const board = minimalBoard({ lists: [listRow(1), listRow(2)], tasks: [] });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: null,
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: null,
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board).toEqual({ total: 0, open: 0, closed: 0 });
    expect(r.lists).toHaveLength(2);
    expect(r.lists[0]!.stats).toEqual({ total: 0, open: 0, closed: 0 });
    expect(r.lists[1]!.stats).toEqual({ total: 0, open: 0, closed: 0 });
  });

  test("counts all task statuses when board hides some in the UI (stats ignore status visibility)", () => {
    const board = minimalBoard({
      tasks: [
        task({ taskId: 1, listId: 1, status: "open" }),
        task({ taskId: 2, listId: 1, status: "closed", closedAt: iso("2025-06-02T12:00:00Z") }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: null,
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: null,
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board.total).toBe(2);
    expect(r.board.open).toBe(1);
    expect(r.board.closed).toBe(1);
  });

  test("all matching tasks closed", () => {
    const board = minimalBoard({
      tasks: [
        task({
          taskId: 1,
          listId: 1,
          status: "closed",
          closedAt: iso("2025-06-02T12:00:00Z"),
        }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: null,
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: null,
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board).toEqual({ total: 1, open: 0, closed: 1 });
    expect(r.lists[0]!.stats).toEqual({ total: 1, open: 0, closed: 1 });
  });

  test("date filter excludes task outside range (opened mode)", () => {
    const board = minimalBoard({
      tasks: [
        task({
          taskId: 1,
          listId: 1,
          status: "open",
          createdAt: iso("2025-07-01T12:00:00Z"),
        }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: null,
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: {
        mode: "opened",
        startDate: "2025-06-01",
        endDate: "2025-06-10",
      },
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board.total).toBe(0);
  });

  test("date filter includes task on boundary day (opened mode)", () => {
    const board = minimalBoard({
      tasks: [
        task({
          taskId: 1,
          listId: 1,
          status: "open",
          createdAt: iso("2025-06-10T12:00:00Z"),
        }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: null,
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: {
        mode: "opened",
        startDate: "2025-06-01",
        endDate: "2025-06-10",
      },
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board.total).toBe(1);
  });

  test("priority filter empty array matches nothing", () => {
    const board = minimalBoard({
      tasks: [task({ taskId: 1, listId: 1, status: "open", priorityId: 10 })],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: null,
      activePriorityIds: [],
      activeReleaseIds: null,
      dateFilter: null,
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board.total).toBe(0);
  });

  test("multiple group ids match as OR", () => {
    const board = minimalBoard({
      taskGroups: [
        { groupId: 0, label: "a", sortOrder: 0 },
        { groupId: 1, label: "b", sortOrder: 1 },
        { groupId: 2, label: "c", sortOrder: 2 },
      ],
      tasks: [
        task({ taskId: 1, listId: 1, status: "open", groupId: 0 }),
        task({ taskId: 2, listId: 1, status: "open", groupId: 1 }),
        task({ taskId: 3, listId: 1, status: "open", groupId: 2 }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: ["0", "2"],
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: null,
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board.total).toBe(2);
  });

  test("explicit empty group filter matches nothing", () => {
    const board = minimalBoard({
      tasks: [task({ taskId: 1, listId: 1, status: "open", groupId: 0 })],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: [],
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: null,
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board.total).toBe(0);
  });

  test("release filter OR with untagged", () => {
    const board = minimalBoard({
      releases: [
        {
          releaseId: 5,
          name: "v1",
          color: "#ff0000",
          releaseDate: null,
          createdAt: iso("2025-01-01T00:00:00Z"),
        },
      ],
      tasks: [
        task({ taskId: 1, listId: 1, status: "open", releaseId: 5 }),
        task({ taskId: 2, listId: 1, status: "open", releaseId: null }),
        task({ taskId: 3, listId: 1, status: "open", releaseId: 5 }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupIds: null,
      activePriorityIds: null,
      activeReleaseIds: [RELEASE_FILTER_UNTAGGED, "5"],
      dateFilter: null,
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board.total).toBe(3);
  });
});

describe("buildBoardStatsSearchParams / boardStatsFilterSignature", () => {
  test("roundtrip with parseBoardStatsFilter (all groups)", () => {
    const filter: BoardStatsFilter = {
      activeGroupIds: null,
      activePriorityIds: ["10", "20"],
      activeReleaseIds: null,
      dateFilter: {
        mode: "opened",
        startDate: "2025-06-01",
        endDate: "2025-06-15",
      },
    };
    const sp = buildBoardStatsSearchParams(filter);
    const parsed = parseBoardStatsFilter(sp);
    expect(parsed.activeGroupIds).toBeNull();
    expect(parsed.activePriorityIds).toEqual(filter.activePriorityIds);
    expect(parsed.activeReleaseIds).toBeNull();
    expect(parsed.dateFilter).toEqual(filter.dateFilter);
    expect(boardStatsFilterSignature(filter).length).toBeGreaterThan(0);
  });

  test("roundtrip preserves multiple groupId (OR)", () => {
    const filter: BoardStatsFilter = {
      activeGroupIds: ["2", "0", "1"],
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: null,
    };
    const sp = buildBoardStatsSearchParams(filter);
    const parsed = parseBoardStatsFilter(sp);
    expect(parsed.activeGroupIds).toEqual(["2", "0", "1"]);
  });
});

describe("parseBoardStatsFilter", () => {
  test("ignores visibleStatuses; reads groupId like tasks API", () => {
    const sp = new URLSearchParams({
      visibleStatuses: "",
      groupId: "0",
      priorityIds: "10,20",
      dateMode: "opened",
      startDate: "2025-06-01",
      endDate: "2025-06-30",
    });
    const f = parseBoardStatsFilter(sp);
    expect(f.activeGroupIds).toEqual(["0"]);
    expect(f.activePriorityIds).toEqual(["10", "20"]);
    expect(f.dateFilter).toEqual({
      mode: "opened",
      startDate: "2025-06-01",
      endDate: "2025-06-30",
    });
  });
});
