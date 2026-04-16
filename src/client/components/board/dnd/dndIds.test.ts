import { describe, expect, test } from "vitest";
import {
  laneBandContainerId,
  parseLaneBandContainerId,
  parseListSortableId,
  parseStackedListContainerId,
  parseTaskSortableId,
  sortableListId,
  sortableTaskId,
  stackedListContainerId,
} from "./dndIds";

describe("dndIds", () => {
  test("list sortable id round-trip", () => {
    expect(sortableListId(7)).toBe("list-7");
    expect(parseListSortableId("list-7")).toBe(7);
    // `Number("")` is 0 — suffix after `list-` must be numeric for non-zero ids.
    expect(parseListSortableId("list-")).toBe(0);
    expect(parseListSortableId("list-abc")).toBeNull();
    expect(parseListSortableId("x-7")).toBeNull();
  });

  test("task sortable id round-trip", () => {
    expect(sortableTaskId(42)).toBe("task-42");
    expect(parseTaskSortableId("task-42")).toBe(42);
  });

  test("stacked list container id round-trip", () => {
    expect(stackedListContainerId(3)).toBe("stacked-list-3");
    expect(parseStackedListContainerId("stacked-list-3")).toBe(3);
    expect(parseStackedListContainerId("stacked-list-")).toBe(0);
    expect(parseStackedListContainerId("stacked-list-x")).toBeNull();
  });

  test("lane band container id round-trip", () => {
    expect(laneBandContainerId(1, "open")).toBe("lane-band-1:open");
    expect(parseLaneBandContainerId("lane-band-1:open")).toEqual({
      listId: 1,
      status: "open",
    });
    expect(parseLaneBandContainerId("lane-band-1:")).toBeNull();
    expect(parseLaneBandContainerId("bad")).toBeNull();
  });
});
