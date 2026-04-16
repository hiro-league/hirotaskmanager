/** @vitest-environment jsdom */
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildBoardShortcutBoard,
  createMockBoardShortcutActions,
} from "@/test/fixtures";
import { renderHookWithProviders } from "@/test/renderWithProviders";
import { useBoardShortcutKeydown } from "./useBoardShortcutKeydown";

describe("useBoardShortcutKeydown", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("dispatches H to openHelp when the board handler runs on a non-editable target", () => {
    const actions = createMockBoardShortcutActions();
    const board = buildBoardShortcutBoard();

    renderHookWithProviders(
      () => {
        useBoardShortcutKeydown({ board, actions });
      },
      { withShortcutScope: true },
    );

    fireEvent.keyDown(window, { key: "h", bubbles: true });
    expect(actions.openHelp).toHaveBeenCalledTimes(1);
  });

  test("does not run shortcut actions when board is null", () => {
    const actions = createMockBoardShortcutActions();

    renderHookWithProviders(
      () => {
        useBoardShortcutKeydown({ board: null, actions });
      },
      { withShortcutScope: true },
    );

    fireEvent.keyDown(window, { key: "h", bubbles: true });
    expect(actions.openHelp).not.toHaveBeenCalled();
  });

  test("does not run shortcut actions when the event target is an input", () => {
    const actions = createMockBoardShortcutActions();
    const board = buildBoardShortcutBoard();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHookWithProviders(
      () => {
        useBoardShortcutKeydown({ board, actions });
      },
      { withShortcutScope: true },
    );

    fireEvent.keyDown(input, { key: "h", bubbles: true });
    expect(actions.openHelp).not.toHaveBeenCalled();
  });

  test("dispatches F3 to openBoardSearch", () => {
    const actions = createMockBoardShortcutActions();
    const board = buildBoardShortcutBoard();
    renderHookWithProviders(
      () => {
        useBoardShortcutKeydown({ board, actions });
      },
      { withShortcutScope: true },
    );
    fireEvent.keyDown(window, { key: "F3", bubbles: true });
    expect(actions.openBoardSearch).toHaveBeenCalledTimes(1);
  });

  test("ignores shortcuts when Ctrl/Meta/Alt modifiers are held", () => {
    const actions = createMockBoardShortcutActions();
    const board = buildBoardShortcutBoard();
    renderHookWithProviders(
      () => {
        useBoardShortcutKeydown({ board, actions });
      },
      { withShortcutScope: true },
    );
    fireEvent.keyDown(window, { key: "h", ctrlKey: true, bubbles: true });
    expect(actions.openHelp).not.toHaveBeenCalled();
  });

  test("does not cycle task groups when the board has no groups", () => {
    const actions = createMockBoardShortcutActions();
    const board = buildBoardShortcutBoard({ taskGroups: [] });
    renderHookWithProviders(
      () => {
        useBoardShortcutKeydown({ board, actions });
      },
      { withShortcutScope: true },
    );
    fireEvent.keyDown(window, { key: "1", bubbles: true });
    expect(actions.cycleTaskGroup).not.toHaveBeenCalled();
  });
});
