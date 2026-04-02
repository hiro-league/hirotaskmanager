import { ALL_TASK_GROUPS, sortPrioritiesByValue } from "../../../../shared/models";
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
    helpContext: "Task highlighted",
    keys: ["G"],
    description: "Cycle the highlighted task group",
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
    helpContext: "Task highlighted",
    keys: ["P"],
    description: "Cycle the highlighted task priority",
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
    id: "move-up",
    scope: "board",
    helpTab: "navigation",
    helpOrder: 13,
    helpContext: "Task or List is Highlighted",
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
    helpContext: "Task or List is Highlighted",
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
    helpContext: "Task or List is Highlighted",
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
    helpContext: "Task or List is Highlighted",
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
    helpContext: "Task is Highlighted",
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
    helpContext: "Task is Highlighted",
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
    helpContext: "Task is Highlighted",
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
    helpContext: "Task is Highlighted",
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
    helpContext: "Task is Highlighted",
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
    id: "edit-highlighted-task-title",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Task is Highlighted",
    keys: ["F2"],
    description: "Edit the highlighted task title in place",
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
    helpContext: "Task or List is Highlighted",
    keys: ["Delete"],
    description: "Delete the highlighted task or list (confirmation)",
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
    helpContext: "Task or List is Highlighted",
    keys: ["T"],
    description: "Open add-task for the highlighted list",
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
    helpContext: "Task or list highlighted",
    keys: ["L"],
    description:
      "Open add-list after the current list (type the name, same as the dashed control)",
    preventDefault: true,
    matchKey: letterKey("l"),
    run: (board, actions) => {
      actions.addListAfterHighlight(board);
    },
  },
  {
    id: "complete-highlighted-task",
    scope: "board",
    helpTab: "tasks",
    helpContext: "Task highlighted",
    keys: ["C"],
    description: "Complete the highlighted task (if not already done)",
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
    helpContext: "Task highlighted",
    keys: ["R"],
    description: "Reopen the highlighted task (if done)",
    preventDefault: true,
    matchKey: letterKey("r"),
    run: (board, actions) => {
      actions.reopenHighlightedTask(board);
    },
  },
];

export function cycleTaskGroupForBoard(
  board: Board,
  setActive: (boardId: string | number, group: string) => void,
): void {
  if (board.taskGroups.length === 0) return;
  const order = [
    ALL_TASK_GROUPS,
    ...board.taskGroups.map((g) => String(g.id)),
  ];
  const raw =
    usePreferencesStore.getState().activeTaskGroupByBoardId[String(board.id)];
  const resolved =
    raw === ALL_TASK_GROUPS
      ? ALL_TASK_GROUPS
      : raw && board.taskGroups.some((g) => String(g.id) === raw)
        ? raw
        : ALL_TASK_GROUPS;
  const idx = Math.max(0, order.indexOf(resolved));
  const next = order[(idx + 1) % order.length] ?? ALL_TASK_GROUPS;
  setActive(board.id, next);
}

export function cycleTaskCardViewModeForBoard(
  board: Board,
  setViewMode: (boardId: string | number, mode: "small" | "normal" | "large" | "larger") => void,
): void {
  const current =
    usePreferencesStore.getState().taskCardViewModeByBoardId[String(board.id)] ?? "normal";
  setViewMode(board.id, getNextTaskCardViewMode(current));
}

export function cycleTaskPriorityForBoard(
  board: Board,
  setActive: (
    boardId: string | number,
    priorityIds: string[] | undefined,
  ) => void,
): void {
  const orderedIds = sortPrioritiesByValue(board.taskPriorities).map((priority) =>
    String(priority.id),
  );
  if (orderedIds.length === 0) return;
  const raw =
    usePreferencesStore.getState().activeTaskPriorityIdsByBoardId[
      String(board.id)
    ];
  if (raw === undefined) {
    setActive(board.id, [orderedIds[0]!]);
    return;
  }
  if (raw.length !== 1 || !orderedIds.includes(raw[0]!)) {
    setActive(board.id, undefined);
    return;
  }
  const resolved = raw[0]!;
  const idx = orderedIds.indexOf(resolved);
  if (idx < 0 || idx >= orderedIds.length - 1) {
    setActive(board.id, undefined);
    return;
  }
  setActive(board.id, [orderedIds[idx + 1]!]);
}
