/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { DEFAULT_BOARD_COLOR } from "../../../shared/boardColor";
import { EMPTY_BOARD_CLI_POLICY } from "../../../shared/cliPolicy";
import type { Board, BoardIndexEntry } from "../../../shared/models";
import {
  createDefaultTaskGroups,
  createDefaultTaskPriorities,
} from "../../../shared/models";
import * as queries from "../queries";
import { usePatchBoard } from "./board";

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
    lists: [],
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

function indexEntry(boardId: number, name: string): BoardIndexEntry {
  return {
    boardId,
    slug: "test",
    name,
    emoji: null,
    description: "",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    createdAt: "2020-01-01T00:00:00.000Z",
  };
}

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("usePatchBoard cache behavior", () => {
  let fetchJsonSpy: Mock;

  beforeEach(() => {
    fetchJsonSpy = vi.spyOn(queries, "fetchJson") as Mock;
  });

  test("rolls back board index and detail when the PATCH fails", async () => {
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const detail = minimalBoard(1);
    qc.setQueryData(queries.boardKeys.all, [indexEntry(1, "Test")]);
    qc.setQueryData(queries.boardKeys.detail(1), detail);

    fetchJsonSpy.mockRejectedValue(new Error("conflict"));

    const { result } = renderHook(() => usePatchBoard(), {
      wrapper: createWrapper(qc),
    });

    await expect(
      result.current.mutateAsync({ boardId: 1, name: " New " }),
    ).rejects.toThrow(/conflict/);

    await waitFor(() => {
      expect(qc.getQueryData<BoardIndexEntry[]>(queries.boardKeys.all)?.[0]?.name).toBe(
        "Test",
      );
      expect(qc.getQueryData<Board>(queries.boardKeys.detail(1))?.name).toBe(
        "Test",
      );
    });
  });
});
