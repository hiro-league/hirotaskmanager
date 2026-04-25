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

  const MAP_123 = new Map<number, number[]>([
    [1, [10]],
    [2, [20]],
    [3, [30]],
  ]);

  test("when highlighted list is removed, focus moves to the list that followed it", () => {
    const { result, rerender } = renderHook(
      (props: typeof HIGHLIGHT_ARGS) => useBoardHighlightState(props),
      {
        initialProps: {
          ...HIGHLIGHT_ARGS,
          listColumnOrder: [1, 2, 3],
          columnMap: MAP_123,
        },
      },
    );

    act(() => {
      result.current.setHighlightedListId(2);
    });
    expect(result.current.highlightedListIdRef.current).toBe(2);

    act(() => {
      rerender({
        ...HIGHLIGHT_ARGS,
        listColumnOrder: [1, 3],
        columnMap: new Map([
          [1, [10]],
          [3, [30]],
        ]),
      });
    });
    expect(result.current.highlightedListIdRef.current).toBe(3);
  });

  test("when the last list was highlighted and removed, focus moves to the list before it", () => {
    const { result, rerender } = renderHook(
      (props: typeof HIGHLIGHT_ARGS) => useBoardHighlightState(props),
      {
        initialProps: {
          ...HIGHLIGHT_ARGS,
          listColumnOrder: [1, 2, 3],
          columnMap: MAP_123,
        },
      },
    );

    act(() => {
      result.current.setHighlightedListId(3);
    });
    act(() => {
      rerender({
        ...HIGHLIGHT_ARGS,
        listColumnOrder: [1, 2],
        columnMap: new Map([
          [1, [10]],
          [2, [20]],
        ]),
      });
    });
    expect(result.current.highlightedListIdRef.current).toBe(2);
  });

  test("when the only list was highlighted and removed, no list stays highlighted", () => {
    const { result, rerender } = renderHook(
      (props: typeof HIGHLIGHT_ARGS) => useBoardHighlightState(props),
      {
        initialProps: {
          ...HIGHLIGHT_ARGS,
          listColumnOrder: [1],
          columnMap: new Map([[1, [10]]]),
        },
      },
    );

    act(() => {
      result.current.setHighlightedListId(1);
    });
    act(() => {
      rerender({
        ...HIGHLIGHT_ARGS,
        listColumnOrder: [],
        columnMap: new Map(),
      });
    });
    expect(result.current.highlightedListIdRef.current).toBeNull();
  });

  test("when a highlighted task is removed, focus moves to the next task in the list", () => {
    const { result, rerender } = renderHook(
      (props: typeof HIGHLIGHT_ARGS) => useBoardHighlightState(props),
      {
        initialProps: {
          ...HIGHLIGHT_ARGS,
          listColumnOrder: [1],
          columnMap: new Map<number, number[]>([[1, [10, 11, 12]]]),
        },
      },
    );
    act(() => {
      result.current.selectTask(11);
    });
    act(() => {
      rerender({
        ...HIGHLIGHT_ARGS,
        listColumnOrder: [1],
        columnMap: new Map<number, number[]>([[1, [10, 12]]]),
      });
    });
    expect(result.current.highlightedTaskIdRef.current).toBe(12);
    expect(result.current.highlightedListIdRef.current).toBeNull();
  });

  test("when the last task in a list was highlighted and removed, focus moves to the task above it", () => {
    const { result, rerender } = renderHook(
      (props: typeof HIGHLIGHT_ARGS) => useBoardHighlightState(props),
      {
        initialProps: {
          ...HIGHLIGHT_ARGS,
          listColumnOrder: [1],
          columnMap: new Map<number, number[]>([[1, [10, 11, 12]]]),
        },
      },
    );
    act(() => {
      result.current.selectTask(12);
    });
    act(() => {
      rerender({
        ...HIGHLIGHT_ARGS,
        listColumnOrder: [1],
        columnMap: new Map<number, number[]>([[1, [10, 11]]]),
      });
    });
    expect(result.current.highlightedTaskIdRef.current).toBe(11);
  });

  test("when the only task in a list was highlighted and removed, focus moves to the list header", () => {
    const { result, rerender } = renderHook(
      (props: typeof HIGHLIGHT_ARGS) => useBoardHighlightState(props),
      {
        initialProps: {
          ...HIGHLIGHT_ARGS,
          listColumnOrder: [1],
          columnMap: new Map<number, number[]>([[1, [10]]]),
        },
      },
    );
    act(() => {
      result.current.selectTask(10);
    });
    act(() => {
      rerender({
        ...HIGHLIGHT_ARGS,
        listColumnOrder: [1],
        columnMap: new Map<number, number[]>([[1, []]]),
      });
    });
    expect(result.current.highlightedTaskIdRef.current).toBeNull();
    expect(result.current.highlightedListIdRef.current).toBe(1);
  });
});
