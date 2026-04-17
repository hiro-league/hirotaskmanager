/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as queries from "@/api/queries";
import {
  buildTaskEditorBoardData,
  buildTestBoard,
  buildTestTask,
} from "@/test/fixtures";
import { createTestQueryClient } from "@/test/renderWithProviders";
import {
  RELEASE_SELECT_AUTO,
  useTaskEditorForm,
} from "./useTaskEditorForm";

afterEach(() => {
  vi.restoreAllMocks();
});

function wrapper(qc: ReturnType<typeof createTestQueryClient>) {
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useTaskEditorForm", () => {
  test("create mode seeds group, priority, and release from the board", async () => {
    const qc = createTestQueryClient();
    const board = buildTaskEditorBoardData(buildTestBoard());

    const { result } = renderHook(
      () =>
        useTaskEditorForm({
          board,
          open: true,
          mode: "create",
          createContext: { listId: 1, status: "open" },
          onClose: vi.fn(),
        }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => {
      expect(result.current.group).toBe("0");
      expect(result.current.priority).toBe("5");
      expect(result.current.release).toBe(RELEASE_SELECT_AUTO);
    });
  });

  test("edit mode is dirty after the user changes the title once detail has loaded", async () => {
    const qc = createTestQueryClient();
    const board = buildTaskEditorBoardData(buildTestBoard());
    const slim = buildTestTask({ title: "Original", body: "x" });
    const full = buildTestTask({ ...slim, body: "full body from API" });
    vi.spyOn(queries, "fetchTaskById").mockResolvedValue(full);

    const { result } = renderHook(
      () =>
        useTaskEditorForm({
          board,
          open: true,
          mode: "edit",
          task: slim,
          onClose: vi.fn(),
        }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => {
      expect(result.current.body).toBe("full body from API");
      expect(result.current.isDirty).toBe(false);
    });

    await act(() => {
      result.current.setTitle("Renamed");
    });

    expect(result.current.isDirty).toBe(true);
  });

  test("edit mode loads full task body from fetchTaskById when detail resolves", async () => {
    const qc = createTestQueryClient();
    const board = buildTaskEditorBoardData(buildTestBoard());
    const slim = buildTestTask({
      body: "slim",
      title: "T",
    });
    const full = buildTestTask({
      ...slim,
      body: "full body from API",
    });

    vi.spyOn(queries, "fetchTaskById").mockResolvedValue(full);

    const { result } = renderHook(
      () =>
        useTaskEditorForm({
          board,
          open: true,
          mode: "edit",
          task: slim,
          onClose: vi.fn(),
        }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => {
      expect(result.current.body).toBe("full body from API");
      expect(result.current.title).toBe("T");
    });
  });
});
