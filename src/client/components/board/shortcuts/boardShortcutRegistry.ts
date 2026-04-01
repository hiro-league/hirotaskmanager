import { ALL_TASK_GROUPS } from "../../../../shared/models";
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

/**
 * Board shortcuts: filters/help, highlight & navigation, task actions (Phase 4).
 * Keep the help dialog in sync with this list.
 */
export const boardShortcutRegistry: BoardShortcutDefinition[] = [
  {
    id: "open-help",
    scope: "board",
    keys: ["H"],
    description: "Open this keyboard shortcuts dialog",
    preventDefault: true,
    matchKey: letterKey("h"),
    run: (_board, actions) => {
      actions.openHelp();
    },
  },
  {
    id: "toggle-filters",
    scope: "board",
    keys: ["M"],
    description: "Show or hide filters and compact header",
    preventDefault: true,
    matchKey: letterKey("m"),
    run: (_board, actions) => {
      actions.toggleFilters();
    },
  },
  {
    id: "cycle-task-card-view-mode",
    scope: "board",
    keys: ["S"],
    description: "Cycle task card view mode",
    preventDefault: true,
    matchKey: letterKey("s"),
    run: (board, actions) => {
      actions.cycleTaskCardViewMode(board);
    },
  },
  {
    id: "cycle-group",
    scope: "board",
    keys: ["G"],
    description: "Cycle task group filter",
    preventDefault: true,
    matchKey: letterKey("g"),
    enabled: (board) => Boolean(board && board.taskGroups.length > 0),
    run: (board, actions) => {
      actions.cycleTaskGroup(board);
    },
  },
  {
    id: "all-groups",
    scope: "board",
    keys: ["A"],
    description: "Show all task groups",
    preventDefault: true,
    matchKey: letterKey("a"),
    run: (board, actions) => {
      actions.allTaskGroups(board);
    },
  },
  {
    id: "focus-task",
    scope: "board",
    keys: ["F"],
    description:
      "Select the task under the mouse, or the first task if none is under the mouse",
    preventDefault: true,
    matchKey: letterKey("f"),
    run: (_board, actions) => {
      actions.focusOrScrollHighlight();
    },
  },
  {
    id: "move-up",
    scope: "board",
    keys: ["↑"],
    description: "Move highlight to the previous task in this list",
    preventDefault: true,
    matchKey: keyCode("ArrowUp"),
    run: (_board, actions) => {
      actions.moveHighlight("up");
    },
  },
  {
    id: "move-down",
    scope: "board",
    keys: ["↓"],
    description: "Move highlight to the next task in this list",
    preventDefault: true,
    matchKey: keyCode("ArrowDown"),
    run: (_board, actions) => {
      actions.moveHighlight("down");
    },
  },
  {
    id: "move-left",
    scope: "board",
    keys: ["←"],
    description: "Move highlight to the previous list column",
    preventDefault: true,
    matchKey: keyCode("ArrowLeft"),
    run: (_board, actions) => {
      actions.moveHighlight("left");
    },
  },
  {
    id: "move-right",
    scope: "board",
    keys: ["→"],
    description: "Move highlight to the next list column",
    preventDefault: true,
    matchKey: keyCode("ArrowRight"),
    run: (_board, actions) => {
      actions.moveHighlight("right");
    },
  },
  {
    id: "home",
    scope: "board",
    keys: ["Home"],
    description: "First task in the current list (or first task on the board if none highlighted)",
    preventDefault: true,
    matchKey: keyCode("Home"),
    run: (_board, actions) => {
      actions.highlightHome();
    },
  },
  {
    id: "end",
    scope: "board",
    keys: ["End"],
    description: "Last task in the current list (or last task on the board if none highlighted)",
    preventDefault: true,
    matchKey: keyCode("End"),
    run: (_board, actions) => {
      actions.highlightEnd();
    },
  },
  {
    id: "page-up",
    scope: "board",
    keys: ["PgUp"],
    description: "Skip several tasks up in the current list",
    preventDefault: true,
    matchKey: keyCode("PageUp"),
    run: (_board, actions) => {
      actions.highlightPage(-1);
    },
  },
  {
    id: "page-down",
    scope: "board",
    keys: ["PgDn"],
    description: "Skip several tasks down in the current list",
    preventDefault: true,
    matchKey: keyCode("PageDown"),
    run: (_board, actions) => {
      actions.highlightPage(1);
    },
  },
  {
    id: "open-highlighted-task",
    scope: "board",
    keys: ["Enter"],
    description: "Open the highlighted task",
    preventDefault: true,
    matchKey: keyCode("Enter"),
    run: (_board, actions) => {
      actions.openHighlightedTask();
    },
  },
  {
    id: "delete-highlighted-task",
    scope: "board",
    keys: ["D"],
    description: "Delete the highlighted task (confirmation)",
    preventDefault: true,
    matchKey: letterKey("d"),
    run: (_board, actions) => {
      actions.requestDeleteHighlightedTask();
    },
  },
  {
    id: "complete-highlighted-task",
    scope: "board",
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
