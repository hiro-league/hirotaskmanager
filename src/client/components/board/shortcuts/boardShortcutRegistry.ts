import {
  ALL_TASK_GROUPS,
  sortPrioritiesByValue,
  sortTaskGroupsForDisplay,
} from "../../../../shared/models";
import type { Board } from "../../../../shared/models";
import {
  getNextTaskCardViewMode,
  usePreferencesStore,
} from "@/store/preferences";
import type { BoardShortcutDefinition } from "./boardShortcutTypes";

function letterKey(letter: string): (key: string) => boolean {
  const lower = letter.toLowerCase();
  return (key: string) => key.length === 1 && key.toLowerCase() === lower;
}

function keyCode(code: string): (key: string) => boolean {
  return (key: string) => key === code;
}

/** Main row 1 or numpad 1 — matches KeyboardEvent.key. */
function keyOne(key: string): boolean {
  return key === "1" || key === "Numpad1";
}

function keyDigit(digit: string): (key: string) => boolean {
  return (key: string) => key === digit;
}

/**
 * Board shortcuts: filters/help, highlight & navigation, task actions (Phase 4).
 * Keep the help dialog in sync: each entry sets helpTab, optional helpContext, and optional helpOrder
 * (sort key within that tab; omit to keep registry order) — see boardShortcutTypes.
 */
export const boardShortcutRegistry: BoardShortcutDefinition[] = [
  {
    id: "open-help",
    scope: "board",
    helpTab: "general",
    helpOrder: 0,
    helpContext: "Board focused (not typing in a field)",
    keys: ["H"],
    description: "Open this keyboard shortcuts dialog",
    preventDefault: true,
    matchKey: letterKey("h"),
    run: (_board, actions) => {
      actions.openHelp();
    },
  },
  {
    id: "open-board-search",
    scope: "board",
    helpTab: "general",
    helpOrder: 2,
    helpContext: "Board focused (not typing in a field)",
    keys: ["K", "F3"],
    description: "Search tasks on this board",
    preventDefault: true,
    // Two alternate keys (help shows "K or F3"); either opens board search.
    matchKey: (key: string) => letterKey("k")(key) || keyCode("F3")(key),
    run: (_board, actions) => {
      actions.openBoardSearch();
    },
  },
  {
    id: "toggle-filters",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 90,
    helpContext: "Board focused (not typing in a field)",
    keys: ["M"],
    description: "Maximize/Minimize Board Header",
    preventDefault: true,
    matchKey: letterKey("m"),
    run: (_board, actions) => {
      actions.toggleFilters();
    },
  },
  {
    id: "cycle-task-card-view-mode",
    scope: "board",
    helpTab: "general",
    helpOrder: 1,
    helpContext: "Board focused (not typing in a field)",
    keys: ["S"],
    description: "Cycle task card view mode",
    preventDefault: true,
    matchKey: letterKey("s"),
    run: (board, actions) => {
      actions.cycleTaskCardViewMode(board);
    },
  },
  {
    id: "toggle-board-layout",
    scope: "board",
    helpTab: "general",
    helpOrder: 1.5,
    helpContext: "Board focused (not typing in a field)",
    keys: ["V"],
    description: "Toggle board layout (lanes / stacked)",
    preventDefault: true,
    matchKey: letterKey("v"),
    run: (board, actions) => {
      actions.toggleBoardLayout(board);
    },
  },
  {
    id: "cycle-group",
    scope: "board",
    helpTab: "boards",
    helpContext: "Board focused; board has task groups",
    keys: ["1", "Num 1"],
    description: "Cycle task group filter",
    preventDefault: true,
    matchKey: keyOne,
    enabled: (board) => Boolean(board && board.taskGroups.length > 0),
    run: (board, actions) => {
      actions.cycleTaskGroup(board);
    },
  },
  {
    id: "all-groups",
    scope: "board",
    helpTab: "boards",
    helpContext: "Board focused (not typing in a field)",
    keys: ["A"],
    description: "Show all task groups",
    preventDefault: true,
    matchKey: letterKey("a"),
    run: (board, actions) => {
      actions.allTaskGroups(board);
    },
  },
  {
    id: "cycle-priority",
    scope: "board",
    helpTab: "boards",
    helpContext: "Board focused; board has priorities",
    keys: ["2"],
    description: "Cycle priority filter",
    preventDefault: true,
    matchKey: keyDigit("2"),
    enabled: (board) => Boolean(board && board.taskPriorities.length > 0),
    run: (board, actions) => {
      actions.cycleTaskPriority(board);
    },
  },
  {
    id: "cycle-highlighted-task-group",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Task is Selected",
    keys: ["G"],
    description: "Cycle the selected task's group",
    preventDefault: true,
    matchKey: letterKey("g"),
    enabled: (board) => Boolean(board && board.taskGroups.length > 0),
    run: (board, actions) => {
      actions.cycleHighlightedTaskGroup(board);
    },
  },
  {
    id: "cycle-highlighted-task-priority",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Task is Selected",
    keys: ["P"],
    description: "Cycle the selected task's priority",
    preventDefault: true,
    matchKey: letterKey("p"),
    enabled: (board) => Boolean(board && board.taskPriorities.length > 0),
    run: (board, actions) => {
      actions.cycleHighlightedTaskPriority(board);
    },
  },
  {
    id: "focus-task",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 0,
    helpContext: "Browser Window is Active",
    keys: ["Tab"],
    description:
      "Focus on Task or List below the pointer",
    preventDefault: true,
    // Unmodified Tab establishes board highlight instead of moving browser focus (Shift+Tab is native).
    matchKey: (key: string) => key === "Tab",
    run: (_board, actions) => {
      actions.focusOrScrollHighlight();
    },
  },
  {
    id: "wheel-pan-board-horizontal",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 15,
    helpContext:
      "Anywhere without vertical scroll",
    keys: ["Scroll wheel"],
    description:
      "Scroll Across the Lists",
    helpOnly: true,
    // Help dialog only — implemented via wheel listeners on the board surface and header.
    matchKey: (_key: string) => false,
    run: () => {},
  },
  {
    id: "move-up",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 13,
    helpContext: "Task or List is Selected",
    keys: ["↑"],
    description:
      "Move to Previous Task Up",
    preventDefault: true,
    matchKey: keyCode("ArrowUp"),
    run: (_board, actions) => {
      actions.moveHighlight("up");
    },
  },
  {
    id: "move-down",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 14,
    helpContext: "Task or List is Selected",
    keys: ["↓"],
    description:
      "Move to Next Task Down",
    preventDefault: true,
    matchKey: keyCode("ArrowDown"),
    run: (_board, actions) => {
      actions.moveHighlight("down");
    },
  },
  {
    id: "move-left",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 11,
    helpContext: "Task or List is Selected",
    keys: ["←"],
    description:
      "Move to the previous Task or List",
    preventDefault: true,
    matchKey: keyCode("ArrowLeft"),
    run: (_board, actions) => {
      actions.moveHighlight("left");
    },
  },
  {
    id: "move-right",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 12,
    helpContext: "Task or List is Selected",
    keys: ["→"],
    description:
      "Move to the next Task or List",
    preventDefault: true,
    matchKey: keyCode("ArrowRight"),
    run: (_board, actions) => {
      actions.moveHighlight("right");
    },
  },
  {
    id: "home",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 20,
    helpContext: "Task is Selected",
    keys: ["Home"],
    description: "Move to First Task in the current list",
    preventDefault: true,
    matchKey: keyCode("Home"),
    run: (_board, actions) => {
      actions.highlightHome();
    },
  },
  {
    id: "end",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 21,
    helpContext: "Task is Selected",
    keys: ["End"],
    description: "Move to Last Task in the current list",
    preventDefault: true,
    matchKey: keyCode("End"),
    run: (_board, actions) => {
      actions.highlightEnd();
    },
  },
  {
    id: "page-up",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 22,
    helpContext: "Task is Selected",
    keys: ["PgUp"],
    description: "Jump up a few tasks in the current list",
    preventDefault: true,
    matchKey: keyCode("PageUp"),
    run: (_board, actions) => {
      actions.highlightPage(-1);
    },
  },
  {
    id: "page-down",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 23,
    helpContext: "Task is Selected",
    keys: ["PgDn"],
    description: "Jump down a few tasks in the current list",
    preventDefault: true,
    matchKey: keyCode("PageDown"),
    run: (_board, actions) => {
      actions.highlightPage(1);
    },
  },
  {
    id: "open-highlighted-task",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Task is Selected",
    keys: ["Enter", "Space"],
    description: "Open the highlighted task",
    preventDefault: true,
    // Match both activation keys so keyboard selection mirrors native button behavior.
    matchKey: (key: string) => keyCode("Enter")(key) || key === " ",
    run: (_board, actions) => {
      actions.openHighlightedTask();
    },
  },
  {
    id: "rename-highlighted-list",
    scope: "board",
    helpTab: "lists",
    helpOrder: 11,
    helpContext: "List is Selected",
    keys: ["F2"],
    description: "Rename the selected list",
    helpOnly: true,
    preventDefault: true,
    matchKey: keyCode("F2"),
    // Dispatch uses edit-highlighted-task-title below; this row is help-dialog only.
    run: () => {},
  },
  {
    id: "edit-highlighted-task-title",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Task is Selected",
    keys: ["F2"],
    description: "Rename the selected task",
    preventDefault: true,
    matchKey: keyCode("F2"),
    run: (_board, actions) => {
      actions.editHighlightedTaskTitle();
    },
  },
  {
    id: "delete-highlighted-task",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Task or List is Selected",
    keys: ["Delete"],
    description: "Delete the selected task or list (confirmation)",
    preventDefault: true,
    matchKey: keyCode("Delete"),
    run: (_board, actions) => {
      actions.requestDeleteHighlight();
    },
  },
  {
    id: "add-task-shortcut",
    scope: "board",
    helpTab: "lists",
    helpOrder: 12,
    helpContext: "List is Selected",
    keys: ["T"],
    description: "Add a task to the selected list",
    preventDefault: true,
    matchKey: letterKey("t"),
    run: (_board, actions) => {
      actions.addTaskAtHighlight();
    },
  },
  {
    id: "add-list-shortcut",
    scope: "board",
    helpTab: "lists",
    helpOrder: 13,
    helpContext: "List is Selected",
    keys: ["L"],
    description:
      "Add a List after the selected list",
    preventDefault: true,
    matchKey: letterKey("l"),
    run: (board, actions) => {
      actions.addListAfterHighlight(board);
    },
  },
  {
    id: "toggle-board-stats",
    scope: "board",
    helpTab: "general",
    helpOrder: 1.25,
    helpContext: "Board focused (not typing in a field)",
    keys: ["N"],
    description: "Show/hide board statistics",
    preventDefault: true,
    matchKey: letterKey("n"),
    run: (board, actions) => {
      actions.toggleBoardStats(board);
    },
  },
  {
    id: "complete-highlighted-task",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Open Task is Selected",
    keys: ["C"],
    description: "Complete the open task",
    preventDefault: true,
    matchKey: letterKey("c"),
    run: (board, actions) => {
      actions.completeHighlightedTask(board);
    },
  },
  {
    id: "reopen-highlighted-task",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Completed Task is Selected",
    keys: ["R"],
    description: "Reopen the completed task",
    preventDefault: true,
    matchKey: letterKey("r"),
    run: (board, actions) => {
      actions.reopenHighlightedTask(board);
    },
  },
  {
    id: "assign-default-release",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Task is Selected; board has a default release",
    keys: ["E"],
    description: "Set task release to the board default",
    preventDefault: true,
    matchKey: letterKey("e"),
    enabled: (b) =>
      Boolean(
        b &&
          b.defaultReleaseId != null &&
          b.releases.some((r) => r.releaseId === b.defaultReleaseId),
      ),
    run: (board, actions) => {
      actions.assignDefaultReleaseToHighlightedTask(board);
    },
  },
];

export function cycleTaskGroupForBoard(
  board: Board,
  setActive: (
    boardId: string | number,
    groupIds: string[] | undefined,
  ) => void,
): void {
  if (board.taskGroups.length === 0) return;
  const groupsOrdered = sortTaskGroupsForDisplay(board.taskGroups);
  const orderedIds = groupsOrdered.map((group) => String(group.groupId));
  const raw =
    usePreferencesStore.getState().activeTaskGroupIdsByBoardId[String(board.boardId)];
  const resolved =
    Array.isArray(raw) && raw.length === 1 && orderedIds.includes(raw[0]!)
      ? raw[0]!
      : ALL_TASK_GROUPS;
  const order = [ALL_TASK_GROUPS, ...orderedIds];
  const idx = Math.max(0, order.indexOf(resolved));
  const next = order[(idx + 1) % order.length] ?? ALL_TASK_GROUPS;
  if (next === ALL_TASK_GROUPS) {
    setActive(board.boardId, undefined);
    return;
  }
  setActive(board.boardId, [next]);
}

export function cycleTaskCardViewModeForBoard(
  board: Board,
  setViewMode: (boardId: string | number, mode: "small" | "normal" | "large" | "larger") => void,
): void {
  const current =
    usePreferencesStore.getState().taskCardViewModeByBoardId[String(board.boardId)] ?? "normal";
  setViewMode(board.boardId, getNextTaskCardViewMode(current));
}

export function cycleTaskPriorityForBoard(
  board: Board,
  setActive: (
    boardId: string | number,
    priorityIds: string[] | undefined,
  ) => void,
): void {
  const orderedIds = sortPrioritiesByValue(board.taskPriorities).map((priority) =>
    String(priority.priorityId),
  );
  if (orderedIds.length === 0) return;
  const raw =
    usePreferencesStore.getState().activeTaskPriorityIdsByBoardId[
      String(board.boardId)
    ];
  if (raw === undefined) {
    setActive(board.boardId, [orderedIds[0]!]);
    return;
  }
  if (raw.length !== 1 || !orderedIds.includes(raw[0]!)) {
    setActive(board.boardId, undefined);
    return;
  }
  const resolved = raw[0]!;
  const idx = orderedIds.indexOf(resolved);
  if (idx < 0 || idx >= orderedIds.length - 1) {
    setActive(board.boardId, undefined);
    return;
  }
  setActive(board.boardId, [orderedIds[idx + 1]!]);
}
