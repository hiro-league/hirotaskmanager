/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { List } from "../../../../shared/models";
import { useBoardHighlightState } from "./useBoardHighlightState";

const BOARD_LISTS: List[] = [
  { listId: 1, name: "A", order: 0, emoji: null },
  { listId: 2, name: "B", order: 1, emoji: null },
];

const COLUMN_MAP = new Map<number, number[]>([
  [1, [10, 11]],
  [2, [20]],
]);

const HIGHLIGHT_ARGS = {
  boardId: 1,
  boardLists: BOARD_LISTS,
  listColumnOrder: [1, 2] as number[],
  columnMap: COLUMN_MAP,
  listElementsRef: { current: new Map<number, HTMLElement>() },
  resolvePointerListId: () => null as number | null,
  pendingRevealTaskIdRef: { current: null as number | null },
  revealTask: () => false,
  clearPendingReveal: vi.fn(),
};

describe("useBoardHighlightState", () => {
  test("applyNotificationTarget selects visible tasks and reports filtered-out ids", () => {
    const { result } = renderHook(() => useBoardHighlightState(HIGHLIGHT_ARGS));

    expect(result.current.applyNotificationTarget({ taskId: 20 })).toEqual({
      kind: "task_selected",
    });
    expect(result.current.highlightedTaskIdRef.current).toBe(20);

    expect(result.current.applyNotificationTarget({ taskId: 999 })).toEqual({
      kind: "task_filtered_out",
      taskId: 999,
    });

    expect(result.current.applyNotificationTarget({ listId: 2 })).toEqual({
      kind: "list_selected",
    });
    expect(result.current.highlightedListIdRef.current).toBe(2);

    expect(result.current.applyNotificationTarget({})).toEqual({
      kind: "noop",
    });
  });

  test("moveHighlight moves down along the current column", () => {
    const { result } = renderHook(() => useBoardHighlightState(HIGHLIGHT_ARGS));

    act(() => {
      result.current.selectTask(10);
    });
    expect(result.current.highlightedTaskIdRef.current).toBe(10);

    act(() => {
      result.current.moveHighlight("down");
    });
    expect(result.current.highlightedTaskIdRef.current).toBe(11);
  });
});
