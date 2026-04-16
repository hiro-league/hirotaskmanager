/** @vitest-environment jsdom */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LAST_BOARD_STORAGE_KEY } from "@/lib/boardPath";
import { renderWithProviders } from "@/test/renderWithProviders";
import { BoardPage } from "./BoardPage";

const BoardViewMock = vi.hoisted(() =>
  vi.fn(() => <div data-testid="board-view-mock" />),
);

vi.mock("@/components/board/BoardView", () => ({
  BoardView: BoardViewMock,
}));

describe("BoardPage", () => {
  afterEach(() => {
    localStorage.clear();
    BoardViewMock.mockClear();
  });

  test("persists last board id to localStorage when the route includes boardId", async () => {
    renderWithProviders(<BoardPage />, {
      initialEntries: ["/board/42"],
      routePath: "/board/:boardId",
    });

    await waitFor(() => {
      expect(localStorage.getItem(LAST_BOARD_STORAGE_KEY)).toBe("42");
    });
    expect(screen.getByTestId("board-view-mock")).toBeTruthy();
    expect(BoardViewMock).toHaveBeenCalledWith({ boardId: "42" }, undefined);
  });
});
