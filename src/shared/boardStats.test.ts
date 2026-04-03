import { describe, expect, test } from "bun:test";
import { ALL_TASK_GROUPS } from "./models";
import type { Board, List, Status, Task } from "./models";
import {
  boardStatsFilterSignature,
  buildBoardStatsSearchParams,
  closedStatusIdsFromStatuses,
  computeBoardStats,
  parseBoardStatsFilter,
  type BoardStatsFilter,
} from "./boardStats";

const iso = (d: string) => new Date(d).toISOString();

function task(p: Partial<Task> & Pick<Task, "id" | "listId" | "status">): Task {
  return {
    title: "",
    body: "",
    groupId: 0,
    order: 0,
    createdAt: iso("2025-06-01T12:00:00Z"),
    updatedAt: iso("2025-06-01T12:00:00Z"),
    ...p,
  };
}

function listRow(id: number): List {
  return { id, name: `L${id}`, order: id };
}

function minimalBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 1,
    name: "B",
    description: "",
    cliAccess: "none",
    taskGroups: [{ id: 0, label: "g" }],
    taskPriorities: [
      { id: 10, value: 10, label: "low", color: "#94a3b8", isSystem: true },
    ],
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
  { id: "open", label: "Open", sortOrder: 0, isClosed: false },
  { id: "in-progress", label: "In progress", sortOrder: 1, isClosed: false },
  { id: "closed", label: "Closed", sortOrder: 2, isClosed: true },
];

describe("computeBoardStats", () => {
  test("empty board: zeros for board and every list", () => {
    const board = minimalBoard({ lists: [listRow(1), listRow(2)], tasks: [] });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupId: ALL_TASK_GROUPS,
      activePriorityIds: null,
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
        task({ id: 1, listId: 1, status: "open" }),
        task({ id: 2, listId: 1, status: "closed", closedAt: iso("2025-06-02T12:00:00Z") }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupId: ALL_TASK_GROUPS,
      activePriorityIds: null,
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
          id: 1,
          listId: 1,
          status: "closed",
          closedAt: iso("2025-06-02T12:00:00Z"),
        }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupId: ALL_TASK_GROUPS,
      activePriorityIds: null,
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
          id: 1,
          listId: 1,
          status: "open",
          createdAt: iso("2025-07-01T12:00:00Z"),
        }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupId: ALL_TASK_GROUPS,
      activePriorityIds: null,
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
          id: 1,
          listId: 1,
          status: "open",
          createdAt: iso("2025-06-10T12:00:00Z"),
        }),
      ],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupId: ALL_TASK_GROUPS,
      activePriorityIds: null,
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
      tasks: [task({ id: 1, listId: 1, status: "open", priorityId: 10 })],
    });
    const closed = closedStatusIdsFromStatuses(workflowThree);
    const filter: BoardStatsFilter = {
      activeGroupId: ALL_TASK_GROUPS,
      activePriorityIds: [],
      dateFilter: null,
    };
    const r = computeBoardStats(board, closed, filter);
    expect(r.board.total).toBe(0);
  });
});

describe("buildBoardStatsSearchParams / boardStatsFilterSignature", () => {
  test("roundtrip with parseBoardStatsFilter", () => {
    const filter: BoardStatsFilter = {
      activeGroupId: ALL_TASK_GROUPS,
      activePriorityIds: ["10", "20"],
      dateFilter: {
        mode: "opened",
        startDate: "2025-06-01",
        endDate: "2025-06-15",
      },
    };
    const sp = buildBoardStatsSearchParams(filter);
    const parsed = parseBoardStatsFilter(sp);
    expect(parsed.activeGroupId).toBe(filter.activeGroupId);
    expect(parsed.activePriorityIds).toEqual(filter.activePriorityIds);
    expect(parsed.dateFilter).toEqual(filter.dateFilter);
    expect(boardStatsFilterSignature(filter).length).toBeGreaterThan(0);
  });
});

describe("parseBoardStatsFilter", () => {
  test("ignores legacy visibleStatuses query param", () => {
    const sp = new URLSearchParams({
      visibleStatuses: "",
      group: "0",
      priorityIds: "10,20",
      dateMode: "opened",
      startDate: "2025-06-01",
      endDate: "2025-06-30",
    });
    const f = parseBoardStatsFilter(sp);
    expect(f.activeGroupId).toBe("0");
    expect(f.activePriorityIds).toEqual(["10", "20"]);
    expect(f.dateFilter).toEqual({
      mode: "opened",
      startDate: "2025-06-01",
      endDate: "2025-06-30",
    });
  });
});
