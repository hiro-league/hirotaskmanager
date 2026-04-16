/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import type { ReleaseDefinition } from "../../../shared/models";
import * as queries from "../queries";
import { notificationKeys } from "../notifications";
import { useCreateBoardRelease } from "./releases";

afterEach(() => {
  vi.restoreAllMocks();
});

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useCreateBoardRelease", () => {
  let fetchJsonSpy: Mock;

  beforeEach(() => {
    fetchJsonSpy = vi.spyOn(queries, "fetchJson") as Mock;
  });

  test("onSuccess invalidates board detail, stats, and notifications", async () => {
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const entity: ReleaseDefinition = {
      releaseId: 7,
      name: "R1",
      createdAt: "2025-03-01T00:00:00.000Z",
    };
    fetchJsonSpy.mockResolvedValue(entity);

    const { result } = renderHook(() => useCreateBoardRelease(), {
      wrapper: createWrapper(qc),
    });

    await result.current.mutateAsync({ boardId: 3, name: "R1" });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queries.boardKeys.detail(3),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["boards", 3, "stats"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: notificationKeys.all,
      });
    });
  });
});
