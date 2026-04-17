/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import type { MutableRefObject, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as queries from "@/api/queries";
import type { Board } from "../../../../shared/models";
import { BoardFilterResolutionProvider } from "@/context/BoardFilterResolutionContext";
import { buildTestBoard, buildTestTask } from "@/test";
import { useBoardColumnMap } from "./useBoardColumnMap";
import { buildListColumnTaskIds } from "./boardTaskNavigation";
import { buildTasksByListStatusIndex, visibleStatusesForBoard } from "../boardStatusUtils";

const filterResolutionValue = {
  activeGroupIds: null as string[] | null,
  activePriorityIds: null as string[] | null,
  activeReleaseIds: null as string[] | null,
  dateFilterResolved: null,
  taskCardViewMode: "normal" as const,
};

afterEach(() => {
  vi.restoreAllMocks();
});

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <BoardFilterResolutionProvider value={filterResolutionValue}>
          {children}
        </BoardFilterResolutionProvider>
      </QueryClientProvider>
    );
  };
}

describe("useBoardColumnMap", () => {
  beforeEach(() => {
    vi.spyOn(queries, "useStatusWorkflowOrder").mockReturnValue([
      "open",
      "in-progress",
      "closed",
    ]);
  });

  test("listColumnOrder follows board list order and columnMap matches buildListColumnTaskIds", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const board = buildTestBoard({
      tasks: [
        buildTestTask({ taskId: 1, listId: 1, status: "open", order: 0 }),
        buildTestTask({ taskId: 2, listId: 2, status: "open", order: 0 }),
      ],
    });
    const listElementsRef: MutableRefObject<Map<number, HTMLElement>> = {
      current: new Map(),
    };

    const { result } = renderHook(
      () =>
        useBoardColumnMap({
          board,
          layout: "lanes",
          listElementsRef,
        }),
      { wrapper: createWrapper(qc) },
    );

    expect(result.current.listColumnOrder).toEqual([1, 2]);

    const visibleStatuses = visibleStatusesForBoard(board, [
      "open",
      "in-progress",
      "closed",
    ]);
    const taskFilter = {
      visibleStatuses,
      workflowOrder: ["open", "in-progress", "closed"] as const,
      activeGroupIds: null,
      activePriorityIds: null,
      activeReleaseIds: null,
      dateFilter: null,
    };
    const tasksByListStatus = buildTasksByListStatusIndex(board.tasks);
    const expected = buildListColumnTaskIds(
      "lanes",
      result.current.listColumnOrder,
      taskFilter,
      tasksByListStatus,
    );
    expect(result.current.columnMap.get(1)).toEqual(expected.get(1));
    expect(result.current.columnMap.get(2)).toEqual(expected.get(2));
  });

  test("setListColumnOrder overrides derived column order for navigation", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const board = buildTestBoard();
    const listElementsRef: MutableRefObject<Map<number, HTMLElement>> = {
      current: new Map(),
    };

    const { result } = renderHook(
      () =>
        useBoardColumnMap({
          board,
          layout: "stacked",
          listElementsRef,
        }),
      { wrapper: createWrapper(qc) },
    );

    expect(result.current.listColumnOrder).toEqual([1, 2]);
    act(() => {
      result.current.setListColumnOrder([2, 1]);
    });
    expect(result.current.listColumnOrder).toEqual([2, 1]);
  });

  test("resets list column order to server list order when board.lists updates", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const listElementsRef: MutableRefObject<Map<number, HTMLElement>> = {
      current: new Map(),
    };

    const listsFromServer = [
      { listId: 1, name: "A", order: 0, emoji: null },
      { listId: 2, name: "B", order: 1, emoji: null },
    ] as const;
    const boardA = buildTestBoard({ lists: [...listsFromServer] });

    const { result, rerender } = renderHook(
      (props: { board: Board }) =>
        useBoardColumnMap({
          board: props.board,
          layout: "lanes",
          listElementsRef,
        }),
      {
        wrapper: createWrapper(qc),
        initialProps: { board: boardA },
      },
    );

    expect(result.current.listColumnOrder).toEqual([1, 2]);
    act(() => {
      result.current.setListColumnOrder([2, 1]);
    });
    expect(result.current.listColumnOrder).toEqual([2, 1]);

    const boardRefresh: Board = {
      ...boardA,
      lists: [...listsFromServer],
    };
    rerender({ board: boardRefresh });
    expect(result.current.listColumnOrder).toEqual([1, 2]);
  });

  test("resolvePointerListId uses last mouse position and column rects", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const board = buildTestBoard();
    const listElementsRef: MutableRefObject<Map<number, HTMLElement>> = {
      current: new Map(),
    };

    const el1 = document.createElement("div");
    el1.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 100,
        top: 0,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      }) as DOMRect;
    const el2 = document.createElement("div");
    el2.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 200,
        top: 0,
        bottom: 100,
        width: 100,
        height: 100,
        x: 100,
        y: 0,
      }) as DOMRect;
    listElementsRef.current.set(1, el1);
    listElementsRef.current.set(2, el2);

    const { result } = renderHook(
      () =>
        useBoardColumnMap({
          board,
          layout: "lanes",
          listElementsRef,
        }),
      { wrapper: createWrapper(qc) },
    );

    act(() => {
      expect(result.current.resolvePointerListId()).toBeNull();
    });

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: 150,
          clientY: 40,
          pointerType: "mouse",
        }),
      );
    });
    act(() => {
      expect(result.current.resolvePointerListId()).toBe(2);
    });
  });
});
