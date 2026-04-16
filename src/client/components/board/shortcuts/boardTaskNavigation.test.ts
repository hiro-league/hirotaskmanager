import { describe, expect, test } from "vitest";
import type { Task } from "../../../../shared/models";
import {
  buildTasksByListStatusIndex,
  type BoardTaskFilterState,
} from "../boardStatusUtils";
import {
  buildListColumnTaskIds,
  findFirstTaskId,
  findLastTaskId,
  findListIdForTask,
  initialHighlightForFirstList,
  PAGE_STEP,
} from "./boardTaskNavigation";

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

const filter: BoardTaskFilterState = {
  visibleStatuses: ["open", "in-progress", "closed"],
  workflowOrder: ["open", "in-progress", "closed"],
  activeGroupIds: null,
  activePriorityIds: null,
  activeReleaseIds: null,
  dateFilter: null,
};

describe("boardTaskNavigation", () => {
  test("PAGE_STEP is stable for keyboard paging", () => {
    expect(PAGE_STEP).toBe(5);
  });

  test("buildListColumnTaskIds maps ordered task ids per list in lanes layout", () => {
    const index = buildTasksByListStatusIndex([
      task({ taskId: 10, listId: 1, status: "open", order: 0 }),
      task({ taskId: 11, listId: 2, status: "open", order: 0 }),
    ]);
    const map = buildListColumnTaskIds("lanes", [1, 2], filter, index);
    expect(map.get(1)).toEqual([10]);
    expect(map.get(2)).toEqual([11]);
  });

  test("findListIdForTask returns list containing task id", () => {
    const m = new Map<number, number[]>([
      [1, [10, 11]],
      [2, [20]],
    ]);
    expect(findListIdForTask(m, 11)).toBe(1);
    expect(findListIdForTask(m, 99)).toBeNull();
  });

  test("findFirstTaskId and findLastTaskId respect list order", () => {
    const m = new Map<number, number[]>([
      [1, [10]],
      [2, [20, 21]],
    ]);
    expect(findFirstTaskId([1, 2], m)).toBe(10);
    expect(findLastTaskId([1, 2], m)).toBe(21);
  });

  test("initialHighlightForFirstList prefers first task or list header", () => {
    expect(
      initialHighlightForFirstList(
        [1, 2],
        new Map([
          [1, [10]],
          [2, []],
        ]),
      ),
    ).toEqual({ kind: "task", taskId: 10 });
    expect(
      initialHighlightForFirstList(
        [1, 2],
        new Map([
          [1, []],
          [2, [20]],
        ]),
      ),
    ).toEqual({ kind: "list", listId: 1 });
  });
});
