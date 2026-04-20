/** @vitest-environment jsdom */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Route, Routes, useParams } from "react-router-dom";
import { LAST_BOARD_STORAGE_KEY } from "@/lib/boardPath";
import { renderWithProviders } from "@/test/renderWithProviders";
import { EMPTY_BOARD_CLI_POLICY } from "../../../shared/cliPolicy";
import type { BoardIndexEntry } from "../../../shared/models";
import { HomeRedirect } from "./HomeRedirect";

const useBoardsMock = vi.fn();
vi.mock("@/api/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/queries")>();
  return {
    ...actual,
    useBoards: () => useBoardsMock(),
  };
});

function boardIndexEntry(overrides: Partial<BoardIndexEntry> = {}): BoardIndexEntry {
  return {
    boardId: 1,
    slug: "board-one",
    name: "Board One",
    emoji: null,
    description: "",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    createdAt: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function BoardLanding() {
  const { boardId } = useParams();
  return (
    <div data-testid="board-landing" data-board-id={boardId}>
      {boardId}
    </div>
  );
}

function renderHomeRoutes() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/board/:boardId" element={<BoardLanding />} />
    </Routes>,
    { initialEntries: ["/"] },
  );
}

describe("HomeRedirect", () => {
  beforeEach(() => {
    useBoardsMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("shows loading skeleton while boards are loading", () => {
    useBoardsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    renderHomeRoutes();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  test("shows countdown error when boards query fails", () => {
    useBoardsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("fetch failed"),
    });
    renderHomeRoutes();
    expect(screen.getByTestId("redirect-countdown-notice")).toBeTruthy();
    expect(screen.getByTestId("redirect-countdown-detail")).toHaveTextContent(
      "fetch failed",
    );
  });

  test("renders no-boards empty state when there are no boards", () => {
    useBoardsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    renderHomeRoutes();
    expect(screen.getByTestId("no-boards-empty-state")).toBeTruthy();
    expect(screen.getByText("No boards yet")).toBeTruthy();
  });

  test("navigates to last visited board when listed in boards index", async () => {
    localStorage.setItem(LAST_BOARD_STORAGE_KEY, "2");
    useBoardsMock.mockReturnValue({
      data: [boardIndexEntry({ boardId: 1 }), boardIndexEntry({ boardId: 2, slug: "b2", name: "Two" })],
      isLoading: false,
      isError: false,
      error: null,
    });
    renderHomeRoutes();
    await waitFor(() => {
      expect(screen.getByTestId("board-landing").getAttribute("data-board-id")).toBe(
        "2",
      );
    });
  });

  test("navigates to first board when last visited id is not in the index", async () => {
    localStorage.setItem(LAST_BOARD_STORAGE_KEY, "999");
    useBoardsMock.mockReturnValue({
      data: [boardIndexEntry({ boardId: 7, slug: "only", name: "Only" })],
      isLoading: false,
      isError: false,
      error: null,
    });
    renderHomeRoutes();
    await waitFor(() => {
      expect(screen.getByTestId("board-landing").getAttribute("data-board-id")).toBe(
        "7",
      );
    });
  });
});
