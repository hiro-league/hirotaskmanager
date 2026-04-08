import { describe, expect, test } from "bun:test";
import type { Task } from "../../../shared/models";
import {
  hashTasksForDndLayoutDeps,
  taskContainerMapsEqual,
} from "./boardTaskDndDeps";

function task(partial: Partial<Task> & Pick<Task, "id" | "listId">): Task {
  return {
    id: partial.id,
    listId: partial.listId,
    title: partial.title ?? "t",
    body: partial.body ?? "",
    groupId: partial.groupId ?? 1,
    priorityId: partial.priorityId ?? 1,
    status: partial.status ?? "open",
    order: partial.order ?? 0,
    createdAt: partial.createdAt ?? "2020-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2020-01-01T00:00:00.000Z",
    releaseId: partial.releaseId,
  };
}

describe("boardTaskDndDeps", () => {
  test("hashTasksForDndLayoutDeps changes when order field changes", () => {
    const a = [task({ id: 1, listId: 1, order: 0 })];
    const b = [task({ id: 1, listId: 1, order: 1 })];
    expect(hashTasksForDndLayoutDeps(a)).not.toBe(hashTasksForDndLayoutDeps(b));
  });

  test("hashTasksForDndLayoutDeps depends on array order", () => {
    const t1 = task({ id: 1, listId: 1, order: 0 });
    const t2 = task({ id: 2, listId: 1, order: 1 });
    expect(hashTasksForDndLayoutDeps([t1, t2])).not.toBe(
      hashTasksForDndLayoutDeps([t2, t1]),
    );
  });

  test("taskContainerMapsEqual matches structural equality", () => {
    const a = { x: ["1", "2"], y: ["3"] };
    const b = { x: ["1", "2"], y: ["3"] };
    expect(taskContainerMapsEqual(a, b)).toBe(true);
  });

  test("taskContainerMapsEqual rejects different order inside band", () => {
    const a = { band: ["task-1", "task-2"] };
    const b = { band: ["task-2", "task-1"] };
    expect(taskContainerMapsEqual(a, b)).toBe(false);
  });

  test("taskContainerMapsEqual rejects different keys", () => {
    expect(taskContainerMapsEqual({ a: [] }, { b: [] })).toBe(false);
  });
});
