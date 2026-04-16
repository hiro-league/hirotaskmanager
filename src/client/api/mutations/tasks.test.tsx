/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { DEFAULT_BOARD_COLOR } from "../../../shared/boardColor";
import { EMPTY_BOARD_CLI_POLICY } from "../../../shared/cliPolicy";
import type { Board } from "../../../shared/models";
import {
  createDefaultTaskGroups,
  createDefaultTaskPriorities,
} from "../../../shared/models";
import * as queries from "../queries";
import { useCreateTask } from "./tasks";

vi.mock("./shared", () => ({
  tempNumericId: () => -999,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function minimalBoard(boardId: number): Board {
  const now = "2020-01-01T00:00:00.000Z";
  const groups = createDefaultTaskGroups();
  const g0 = groups[0]!.groupId;
  return {
    boardId,
    name: "Test",
    slug: "test",
    emoji: null,
    description: "",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    taskGroups: groups,
    defaultTaskGroupId: g0,
    deletedGroupFallbackId: g0,
    taskPriorities: createDefaultTaskPriorities(),
    releases: [],
    defaultReleaseId: null,
    autoAssignReleaseOnCreateUi: false,
    autoAssignReleaseOnCreateCli: false,
    visibleStatuses: ["open", "in-progress", "closed"],
    boardLayout: "stacked",
    boardColor: DEFAULT_BOARD_COLOR,
    showStats: false,
    muteCelebrationSounds: false,
    lists: [{ listId: 1, name: "Col", order: 0, emoji: null }],
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useCreateTask cache behavior", () => {
  let fetchJsonSpy: Mock;

  beforeEach(() => {
    fetchJsonSpy = vi.spyOn(queries, "fetchJson") as Mock;
  });

  test("rolls back optimistic board cache when the POST fails", async () => {
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const board = minimalBoard(1);
    qc.setQueryData(queries.boardKeys.detail(1), board);

    fetchJsonSpy.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useCreateTask(), {
      wrapper: createWrapper(qc),
    });

    await expect(
      result.current.mutateAsync({
        boardId: 1,
        listId: 1,
        status: "open",
        title: "T",
        body: "",
        groupId: board.defaultTaskGroupId,
      }),
    ).rejects.toThrow(/network/);

    await waitFor(() => {
      expect(qc.getQueryData(queries.boardKeys.detail(1))).toEqual(board);
    });
  });

  test("replaces optimistic task with server entity on success", async () => {
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const board = minimalBoard(1);
    qc.setQueryData(queries.boardKeys.detail(1), board);

    fetchJsonSpy.mockResolvedValue({
      boardId: 1,
      boardSlug: "test",
      boardUpdatedAt: "2025-01-02T00:00:00.000Z",
      entity: {
        taskId: 100,
        listId: 1,
        title: "T",
        body: "",
        groupId: board.defaultTaskGroupId,
        priorityId: 5,
        status: "open",
        order: 0,
        emoji: null,
        createdAt: "2025-01-02T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      },
    });

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useCreateTask(), {
      wrapper: createWrapper(qc),
    });

    await result.current.mutateAsync({
      boardId: 1,
      listId: 1,
      status: "open",
      title: "T",
      body: "",
      groupId: board.defaultTaskGroupId,
    });

    await waitFor(() => {
      const next = qc.getQueryData<Board>(queries.boardKeys.detail(1));
      expect(next?.tasks.some((t) => t.taskId === -999)).toBe(false);
      expect(next?.tasks.find((t) => t.taskId === 100)?.title).toBe("T");
      expect(next?.updatedAt).toBe("2025-01-02T00:00:00.000Z");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["boards", 1, "stats"],
    });
  });
});
