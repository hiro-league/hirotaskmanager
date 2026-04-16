import { describe, expect, test } from "vitest";
import type { Task } from "../../../shared/models";
import {
  buildTasksByListStatusIndex,
  listColumnTasksSortedFromIndex,
  listStatusBandKey,
  listTasksMergedSortedFromIndex,
  weightsAfterVisibilityChange,
  type BoardTaskFilterState,
} from "./boardStatusUtils";

function task(
  partial: Partial<Task> & Pick<Task, "taskId" | "listId" | "status">,
): Task {
  return {
    title: "t",
    body: "",
    groupId: 1,
    priorityId: 1,
    order: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    emoji: null,
    ...partial,
  };
}

const filterAll: BoardTaskFilterState = {
  visibleStatuses: ["open", "in-progress", "closed"],
  workflowOrder: ["open", "in-progress", "closed"],
  activeGroupIds: null,
  activePriorityIds: null,
  activeReleaseIds: null,
  dateFilter: null,
};

describe("boardStatusUtils", () => {
  test("listStatusBandKey formats list and status", () => {
    expect(listStatusBandKey(3, "open")).toBe("3:open");
  });

  test("buildTasksByListStatusIndex buckets and sorts by order within band", () => {
    const index = buildTasksByListStatusIndex([
      task({ taskId: 1, listId: 1, status: "open", order: 2 }),
      task({ taskId: 2, listId: 1, status: "open", order: 0 }),
      task({ taskId: 3, listId: 2, status: "closed", order: 0 }),
    ]);
    expect(index.get("1:open")?.map((t) => t.taskId)).toEqual([2, 1]);
    expect(index.get("2:closed")?.map((t) => t.taskId)).toEqual([3]);
  });

  test("weightsAfterVisibilityChange carries weights and normalizes to target length", () => {
    const w = weightsAfterVisibilityChange(
      ["open", "closed"],
      [2, 2],
      ["open", "in-progress", "closed"],
    );
    expect(w).toHaveLength(3);
    const sum = w.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(3, 5);
  });

  test("listTasksMergedSortedFromIndex sorts by workflow order then order", () => {
    const index = buildTasksByListStatusIndex([
      task({ taskId: 1, listId: 1, status: "closed", order: 0 }),
      task({ taskId: 2, listId: 1, status: "open", order: 0 }),
    ]);
    const f: BoardTaskFilterState = {
      ...filterAll,
      visibleStatuses: ["open", "closed"],
      workflowOrder: ["open", "in-progress", "closed"],
    };
    const merged = listTasksMergedSortedFromIndex(index, 1, f);
    expect(merged.map((t) => t.taskId)).toEqual([2, 1]);
  });

  test("listColumnTasksSortedFromIndex lanes flatMaps visible statuses in order", () => {
    const index = buildTasksByListStatusIndex([
      task({ taskId: 1, listId: 1, status: "open", order: 0 }),
      task({ taskId: 2, listId: 1, status: "in-progress", order: 0 }),
    ]);
    const f: BoardTaskFilterState = {
      ...filterAll,
      visibleStatuses: ["open", "in-progress"],
      workflowOrder: ["open", "in-progress", "closed"],
    };
    const lanes = listColumnTasksSortedFromIndex(index, "lanes", 1, f);
    expect(lanes.map((t) => t.taskId)).toEqual([1, 2]);
  });

  test("listColumnTasksSortedFromIndex stacked uses merged sort", () => {
    const index = buildTasksByListStatusIndex([
      task({ taskId: 1, listId: 1, status: "closed", order: 0 }),
      task({ taskId: 2, listId: 1, status: "open", order: 0 }),
    ]);
    const f: BoardTaskFilterState = {
      ...filterAll,
      visibleStatuses: ["open", "closed"],
      workflowOrder: ["open", "in-progress", "closed"],
    };
    const stacked = listColumnTasksSortedFromIndex(index, "stacked", 1, f);
    expect(stacked.map((t) => t.taskId)).toEqual([2, 1]);
  });
});
