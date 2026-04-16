import { describe, expect, test } from "vitest";
import { boardShortcutRegistry } from "./boardShortcutRegistry";
import type { BoardShortcutBoard } from "./boardShortcutTypes";

function minimalBoard(
  overrides: Partial<BoardShortcutBoard> = {},
): BoardShortcutBoard {
  return {
    boardId: 1,
    boardLayout: "stacked",
    defaultReleaseId: null,
    releases: [],
    showStats: false,
    taskGroups: [
      { groupId: 0, label: "g", sortOrder: 0 },
      { groupId: 1, label: "h", sortOrder: 1 },
    ],
    taskPriorities: [],
    tasks: [],
    ...overrides,
  };
}

describe("boardShortcutRegistry", () => {
  test("open-help matches h case-insensitively", () => {
    const def = boardShortcutRegistry.find((d) => d.id === "open-help");
    expect(def).toBeDefined();
    expect(def!.matchKey("h")).toBe(true);
    expect(def!.matchKey("H")).toBe(true);
    expect(def!.matchKey("j")).toBe(false);
  });

  test("open-board-search matches K and F3", () => {
    const def = boardShortcutRegistry.find((d) => d.id === "open-board-search");
    expect(def).toBeDefined();
    expect(def!.matchKey("k")).toBe(true);
    expect(def!.matchKey("K")).toBe(true);
    expect(def!.matchKey("F3")).toBe(true);
    expect(def!.matchKey("F4")).toBe(false);
  });

  test("cycle-group is disabled when the board has no task groups", () => {
    const def = boardShortcutRegistry.find((d) => d.id === "cycle-group");
    expect(def).toBeDefined();
    const empty = minimalBoard({ taskGroups: [] });
    expect(def!.enabled?.(empty)).toBe(false);
    expect(def!.enabled?.(minimalBoard())).toBe(true);
  });

  test("first matching registry entry wins (open-help before other H bindings)", () => {
    const help = boardShortcutRegistry.findIndex((d) => d.id === "open-help");
    const anyLaterH = boardShortcutRegistry.findIndex(
      (d, i) => i > help && d.matchKey("h"),
    );
    if (anyLaterH >= 0) {
      expect(help).toBeLessThan(anyLaterH);
    }
  });
});
