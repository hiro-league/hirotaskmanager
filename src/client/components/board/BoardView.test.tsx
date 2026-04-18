/** @vitest-environment jsdom */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Route, Routes, useParams } from "react-router-dom";
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

const useSuspenseBoardMock = vi.fn();
vi.mock("@/api/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/queries")>();
  return {
    ...actual,
    /** BoardView body uses suspense board fetch; mocking avoids real `fetch` in jsdom (Phase 9 tests). */
    useSuspenseBoard: (...args: unknown[]) => useSuspenseBoardMock(...args),
  };
});

vi.mock("@/components/board/columns/BoardColumns", () => ({
  BoardColumns: () => <div data-testid="board-columns-lanes" />,
}));

vi.mock("@/components/board/columns/BoardColumnsStacked", () => ({
  BoardColumnsStacked: () => <div data-testid="board-columns-stacked" />,
}));

function BoardViewFromParams() {
  const { boardId } = useParams();
  return <BoardView boardId={boardId ?? null} />;
}

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
    useSuspenseBoardMock.mockReset();
    usePreferencesStore.getState().setBoardShortcutHelpDismissed(false);
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("shows no-board-selected empty state when boardId is null", () => {
    renderBoardView(<BoardView boardId={null} />, { initialEntries: ["/"] });
    expect(screen.getByText("No board selected")).toBeTruthy();
  });

  test("shows loading skeleton while board detail is loading", () => {
    useSuspenseBoardMock.mockImplementation(() => {
      // Never resolves → `Suspense` shows `BoardViewLoadingFallback` (pulse placeholders).
      throw new Promise(() => {});
    });
    renderBoardView(<BoardView boardId="1" />);
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  test("shows countdown error when board detail fails for a non-404 error", () => {
    useSuspenseBoardMock.mockImplementation(() => {
      throw new Error("upstream unavailable");
    });
    renderBoardView(
      <Routes>
        <Route path="/board/:boardId" element={<BoardViewFromParams />} />
        <Route path="/" element={<div data-testid="home-mark">home</div>} />
      </Routes>,
      { initialEntries: ["/board/1"] },
    );
    expect(screen.getByTestId("redirect-countdown-notice")).toBeTruthy();
    expect(screen.getByTestId("redirect-countdown-detail")).toHaveTextContent(
      "upstream unavailable",
    );
  });

  test("shows countdown when board GET reports not found, then can go home", async () => {
    const user = userEvent.setup();
    useSuspenseBoardMock.mockImplementation(() => {
      throw new Error("Board not found");
    });
    renderBoardView(
      <Routes>
        <Route path="/board/:boardId" element={<BoardViewFromParams />} />
        <Route path="/" element={<div data-testid="home-mark">home</div>} />
      </Routes>,
      { initialEntries: ["/board/1"] },
    );
    expect(screen.getByTestId("redirect-countdown-notice")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /go home now/i }));
    await waitFor(() => {
      expect(screen.getByTestId("home-mark")).toBeTruthy();
    });
  });

  test("renders stacked layout branch when board layout is stacked", () => {
    useSuspenseBoardMock.mockReturnValue({
      data: buildTestBoard({ boardId: 1, boardLayout: "stacked" }),
    });
    // Success path mounts BoardNotificationDeepLink, which uses react-router.
    renderBoardView(<BoardView boardId="1" />, { initialEntries: ["/"] });
    expect(screen.getByTestId("board-columns-stacked")).toBeTruthy();
    expect(screen.queryByTestId("board-columns-lanes")).toBeNull();
  });

  test("renders lanes layout branch when board layout is lanes", () => {
    useSuspenseBoardMock.mockReturnValue({
      data: buildTestBoard({ boardId: 1, boardLayout: "lanes" }),
    });
    renderBoardView(<BoardView boardId="1" />, { initialEntries: ["/"] });
    expect(screen.getByTestId("board-columns-lanes")).toBeTruthy();
    expect(screen.queryByTestId("board-columns-stacked")).toBeNull();
  });

  test("auto-opens shortcut help on first load when not dismissed in preferences", async () => {
    useSuspenseBoardMock.mockReturnValue({
      data: buildTestBoard({ boardId: 1 }),
    });
    renderBoardView(<BoardView boardId="1" />, { initialEntries: ["/"] });
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
  });
});
