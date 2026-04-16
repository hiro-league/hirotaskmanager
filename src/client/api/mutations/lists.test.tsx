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
import { usePatchList } from "./lists";

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

describe("usePatchList cache behavior", () => {
  let fetchJsonSpy: Mock;

  beforeEach(() => {
    fetchJsonSpy = vi.spyOn(queries, "fetchJson") as Mock;
  });

  test("rolls back optimistic list patch when the PATCH fails", async () => {
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const board = minimalBoard(1);
    qc.setQueryData(queries.boardKeys.detail(1), board);

    fetchJsonSpy.mockRejectedValue(new Error("denied"));

    const { result } = renderHook(() => usePatchList(), {
      wrapper: createWrapper(qc),
    });

    await expect(
      result.current.mutateAsync({
        boardId: 1,
        listId: 1,
        patch: { name: " Renamed " },
      }),
    ).rejects.toThrow(/denied/);

    await waitFor(() => {
      expect(qc.getQueryData<Board>(queries.boardKeys.detail(1))?.lists[0])
        .toMatchObject({
          name: "Col",
        });
    });
  });
});
