/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SearchHit } from "../../../../shared/models";
import * as searchApi from "@/api/search";
import { BoardTaskKeyboardBridgeProvider } from "@/components/board/shortcuts/BoardTaskKeyboardBridge";
import { ShortcutScopeProvider } from "@/components/board/shortcuts/ShortcutScopeContext";
import { buildTestBoard } from "@/test/fixtures";
import { createTestQueryClient } from "@/test/renderWithProviders";
import { BoardSearchDialog } from "./BoardSearchDialog";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSearchDialog(
  props: { open: boolean; onClose: () => void } = {
    open: true,
    onClose: vi.fn(),
  },
) {
  const qc = createTestQueryClient();
  return {
    onClose: props.onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <ShortcutScopeProvider>
          <BoardTaskKeyboardBridgeProvider>
            <BoardSearchDialog board={buildTestBoard()} {...props} />
          </BoardTaskKeyboardBridgeProvider>
        </ShortcutScopeProvider>
      </QueryClientProvider>,
    ),
  };
}

describe("BoardSearchDialog", () => {
  test("shows helper copy before the user types a query", () => {
    renderSearchDialog();
    expect(
      screen.getByText(/Type to search titles, descriptions/i),
    ).toBeTruthy();
  });

  test("fetches and lists hits after debounced input", async () => {
    const hit: SearchHit = {
      taskId: 99,
      boardId: 1,
      boardSlug: "b",
      boardName: "B",
      listId: 1,
      listName: "Col",
      title: "Match title",
      snippet: "snippet",
      score: 0.1,
    };
    vi.spyOn(searchApi, "fetchBoardSearchHits").mockResolvedValue([hit]);

    renderSearchDialog();
    // StrictMode may leave two dialog trees briefly; target the first search field.
    const input = screen.getAllByPlaceholderText(/Search tasks on this board/)[0]!;
    await userEvent.type(input, "hello");

    await waitFor(
      () => {
        expect(screen.getByText("Match title")).toBeTruthy();
      },
      { timeout: 4000 },
    );
  });

  test("Escape requests close while open", async () => {
    const onClose = vi.fn();
    renderSearchDialog({ open: true, onClose });
    fireEvent.keyDown(window, { key: "Escape", bubbles: true });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
