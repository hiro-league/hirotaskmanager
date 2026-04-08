import { describe, expect, test } from "bun:test";
import {
  RELEASE_FILTER_UNTAGGED,
  taskMatchesBoardFilter,
  taskMatchesReleaseFilter,
} from "./boardFilters";
import type { Task } from "./models";

const baseTask: Task = {
  id: 1,
  listId: 1,
  title: "t",
  body: "",
  groupId: 10,
  priorityId: 20,
  status: "open",
  order: 0,
  emoji: null,
  createdAt: "2024-06-01T12:00:00.000Z",
  updatedAt: "2024-06-01T12:00:00.000Z",
};

describe("taskMatchesReleaseFilter (phase 5 regression)", () => {
  test("null = all releases", () => {
    expect(taskMatchesReleaseFilter({ ...baseTask, releaseId: 5 }, null)).toBe(
      true,
    );
    expect(taskMatchesReleaseFilter({ ...baseTask, releaseId: null }, null)).toBe(
      true,
    );
  });

  test("empty = nothing", () => {
    expect(taskMatchesReleaseFilter({ ...baseTask, releaseId: 5 }, [])).toBe(
      false,
    );
  });

  test("OR numeric id", () => {
    const f = ["3", "7"];
    expect(taskMatchesReleaseFilter({ ...baseTask, releaseId: 7 }, f)).toBe(true);
    expect(taskMatchesReleaseFilter({ ...baseTask, releaseId: 4 }, f)).toBe(
      false,
    );
  });

  test("untagged sentinel OR id", () => {
    const f = [RELEASE_FILTER_UNTAGGED, "2"];
    expect(taskMatchesReleaseFilter({ ...baseTask, releaseId: null }, f)).toBe(
      true,
    );
    expect(taskMatchesReleaseFilter({ ...baseTask, releaseId: 2 }, f)).toBe(true);
    expect(taskMatchesReleaseFilter({ ...baseTask, releaseId: 9 }, f)).toBe(
      false,
    );
  });
});

describe("taskMatchesBoardFilter with release dimension", () => {
  test("release filter combines with group", () => {
    const filter = {
      activeGroupIds: ["10"],
      activePriorityIds: null,
      activeReleaseIds: ["2"],
      dateFilter: null,
    };
    expect(
      taskMatchesBoardFilter({ ...baseTask, groupId: 10, releaseId: 2 }, filter),
    ).toBe(true);
    expect(
      taskMatchesBoardFilter({ ...baseTask, groupId: 99, releaseId: 2 }, filter),
    ).toBe(false);
    expect(
      taskMatchesBoardFilter({ ...baseTask, groupId: 10, releaseId: 9 }, filter),
    ).toBe(false);
  });
});
