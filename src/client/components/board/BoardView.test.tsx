/** @vitest-environment jsdom */
import { screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { BoardSearchProvider } from "@/context/BoardSearchContext";
import { usePreferencesStore } from "@/store/preferences";
import { buildTestBoard } from "@/test/fixtures";
import { renderWithProviders } from "@/test/renderWithProviders";
import { BoardView } from "./BoardView";

vi.mock("@/api/useBoardChangeStream", () => ({
  useBoardChangeStream: vi.fn(),
}));

vi.mock("@/api/mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/mutations")>();
  return {
    ...actual,
    usePatchBoard: () => ({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    }),
  };
});

const useBoardMock = vi.fn();
vi.mock("@/api/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/queries")>();
  return {
    ...actual,
    useBoard: (...args: unknown[]) => useBoardMock(...args),
  };
});

vi.mock("@/components/board/columns/BoardColumns", () => ({
  BoardColumns: () => <div data-testid="board-columns-lanes" />,
}));

vi.mock("@/components/board/columns/BoardColumnsStacked", () => ({
  BoardColumnsStacked: () => <div data-testid="board-columns-stacked" />,
}));

function renderBoardView(
  ui: ReactElement,
  options: { initialEntries?: string[]; routePath?: string } = {},
) {
  return renderWithProviders(
    <BoardSearchProvider>{ui}</BoardSearchProvider>,
    options,
  );
}

describe("BoardView", () => {
  beforeEach(() => {
    useBoardMock.mockReset();
    usePreferencesStore.getState().setBoardShortcutHelpDismissed(false);
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("shows no-board-selected empty state when boardId is null", () => {
    useBoardMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      status: "pending",
    });
    renderBoardView(<BoardView boardId={null} />);
    expect(screen.getByText("No board selected")).toBeTruthy();
  });

  test("shows loading skeleton while board detail is loading", () => {
    useBoardMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      error: null,
      status: "pending",
    });
    renderBoardView(<BoardView boardId="1" />);
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  test("shows error message when board detail fails for a non-404 error", () => {
    useBoardMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("upstream unavailable"),
      status: "error",
    });
    renderBoardView(<BoardView boardId="1" />);
    expect(screen.getByText("upstream unavailable")).toBeTruthy();
  });

  test("redirects to Trash when board GET reports not found", async () => {
    useBoardMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("Board not found"),
      status: "error",
    });
    renderBoardView(
      <Routes>
        <Route
          path="/"
          element={<BoardView boardId="1" />}
        />
        <Route path="/trash" element={<div data-testid="trash-page">Trash</div>} />
      </Routes>,
      { initialEntries: ["/"] },
    );
    await waitFor(() => {
      expect(screen.getByTestId("trash-page")).toBeTruthy();
    });
  });

  test("renders stacked layout branch when board layout is stacked", () => {
    useBoardMock.mockReturnValue({
      data: buildTestBoard({ boardId: 1, boardLayout: "stacked" }),
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      status: "success",
    });
    // Success path mounts BoardNotificationDeepLink, which uses react-router.
    renderBoardView(<BoardView boardId="1" />, { initialEntries: ["/"] });
    expect(screen.getByTestId("board-columns-stacked")).toBeTruthy();
    expect(screen.queryByTestId("board-columns-lanes")).toBeNull();
  });

  test("renders lanes layout branch when board layout is lanes", () => {
    useBoardMock.mockReturnValue({
      data: buildTestBoard({ boardId: 1, boardLayout: "lanes" }),
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      status: "success",
    });
    renderBoardView(<BoardView boardId="1" />, { initialEntries: ["/"] });
    expect(screen.getByTestId("board-columns-lanes")).toBeTruthy();
    expect(screen.queryByTestId("board-columns-stacked")).toBeNull();
  });

  test("auto-opens shortcut help on first load when not dismissed in preferences", async () => {
    useBoardMock.mockReturnValue({
      data: buildTestBoard({ boardId: 1 }),
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      status: "success",
    });
    renderBoardView(<BoardView boardId="1" />, { initialEntries: ["/"] });
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
  });
});
