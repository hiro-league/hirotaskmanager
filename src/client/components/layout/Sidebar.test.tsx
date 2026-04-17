/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EMPTY_BOARD_CLI_POLICY } from "../../../shared/cliPolicy";
import type { BoardIndexEntry } from "../../../shared/models";
import * as queries from "@/api/queries";
import { Sidebar } from "@/components/layout/Sidebar";
import { createTestQueryClient } from "@/test/renderWithProviders";

const SAMPLE_BOARD: BoardIndexEntry = {
  boardId: 42,
  slug: "sample",
  name: "Sample Board",
  emoji: null,
  description: "",
  cliPolicy: EMPTY_BOARD_CLI_POLICY,
  createdAt: "2020-01-01T00:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sidebar", () => {
  test("lists boards from the index and shows empty-state when none", () => {
    vi.spyOn(queries, "useBoards").mockReturnValue({
      data: [SAMPLE_BOARD],
      isLoading: false,
      isError: false,
      error: null,
      status: "success",
      isPending: false,
      isFetching: false,
    } as unknown as ReturnType<typeof queries.useBoards>);

    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/board/42"]}>
          <Sidebar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Boards")).toBeInTheDocument();
    expect(screen.getByText("Sample Board")).toBeInTheDocument();
  });

  test("shows loading copy while boards are loading", () => {
    vi.spyOn(queries, "useBoards").mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      status: "pending",
      isPending: true,
      isFetching: true,
    } as unknown as ReturnType<typeof queries.useBoards>);

    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
