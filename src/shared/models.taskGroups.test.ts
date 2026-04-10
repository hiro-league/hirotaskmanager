import { describe, expect, test } from "bun:test";
import {
  effectiveDefaultTaskGroupId,
  sortTaskGroupsForDisplay,
} from "./models";

describe("sortTaskGroupsForDisplay", () => {
  test("orders by sortOrder then groupId", () => {
    const groups = [
      { groupId: 30, label: "c", sortOrder: 2 },
      { groupId: 10, label: "a", sortOrder: 0 },
      { groupId: 20, label: "b", sortOrder: 1 },
    ];
    expect(sortTaskGroupsForDisplay(groups).map((g) => g.groupId)).toEqual([
      10, 20, 30,
    ]);
  });

  test("does not mutate input", () => {
    const groups = [
      { groupId: 2, label: "b", sortOrder: 1 },
      { groupId: 1, label: "a", sortOrder: 0 },
    ];
    const copy = [...groups];
    sortTaskGroupsForDisplay(groups);
    expect(groups).toEqual(copy);
  });
});

describe("effectiveDefaultTaskGroupId", () => {
  test("uses default when it matches a group", () => {
    expect(
      effectiveDefaultTaskGroupId({
        taskGroups: [
          { groupId: 1, label: "a", sortOrder: 0 },
          { groupId: 2, label: "b", sortOrder: 1 },
        ],
        defaultTaskGroupId: 2,
      }),
    ).toBe(2);
  });

  test("falls back to first in display order when default is stale", () => {
    expect(
      effectiveDefaultTaskGroupId({
        taskGroups: [
          { groupId: 20, label: "second", sortOrder: 1 },
          { groupId: 10, label: "first", sortOrder: 0 },
        ],
        defaultTaskGroupId: 999,
      }),
    ).toBe(10);
  });

  test("returns 0 when no groups", () => {
    expect(
      effectiveDefaultTaskGroupId({
        taskGroups: [],
        defaultTaskGroupId: 1,
      }),
    ).toBe(0);
  });
});
