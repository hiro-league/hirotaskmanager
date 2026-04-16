/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ShortcutScopeProvider } from "@/components/board/shortcuts/ShortcutScopeContext";
import { buildTestBoard } from "@/test/fixtures";
import { createTestQueryClient } from "@/test/renderWithProviders";
import { BoardEditDialog } from "./BoardEditDialog";

vi.mock("@/components/emoji/EmojiPickerMenuButton", () => ({
  EmojiPickerMenuButton: () => <div data-testid="emoji-mock" />,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BoardEditDialog", () => {
  test("disables Save when the name is empty", async () => {
    const qc = createTestQueryClient();
    const board = buildTestBoard({ name: "Named" });
    render(
      <QueryClientProvider client={qc}>
        <ShortcutScopeProvider>
          <BoardEditDialog board={board} open onClose={vi.fn()} />
        </ShortcutScopeProvider>
      </QueryClientProvider>,
    );

    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Named");

    await userEvent.clear(nameInput);
    const save = screen.getByRole("button", { name: /^Save$/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});
