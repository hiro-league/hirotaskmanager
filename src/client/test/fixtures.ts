import { vi } from "vitest";
import type { NotificationsPage } from "../../shared/notifications";
import { DEFAULT_BOARD_COLOR } from "../../shared/boardColor";
import { EMPTY_BOARD_CLI_POLICY } from "../../shared/cliPolicy";
import type { Board, List, Task } from "../../shared/models";
import {
  createDefaultTaskGroups,
  createDefaultTaskPriorities,
} from "../../shared/models";
import type { TaskEditorBoardData } from "@/components/board/boardColumnData";
import { taskEditorBoardData } from "@/components/board/boardColumnData";
import type {
  BoardShortcutActions,
  BoardShortcutBoard,
} from "@/components/board/shortcuts/boardShortcutTypes";

/** Minimal `Board` for client tests — extend via `overrides` (initial development; no legacy shapes). */
export function buildTestBoard(overrides: Partial<Board> = {}): Board {
  const now = "2020-01-01T00:00:00.000Z";
  const groups = createDefaultTaskGroups();
  const g0 = groups[0]!.groupId;
  return {
    boardId: 1,
    name: "Test board",
    slug: "test-board",
    emoji: null,
    description: "",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    taskGroups: groups,
    defaultTaskGroupId: g0,
    deletedGroupFallbackId: g0,
    taskPriorities: createDefaultTaskPriorities(),
    releases: [],
    defaultReleaseId: null,
    autoAssignReleaseOnCreateUi: false,
    autoAssignReleaseOnCreateCli: false,
    visibleStatuses: ["open", "in-progress", "closed"],
    boardLayout: "stacked",
    boardColor: DEFAULT_BOARD_COLOR,
    showStats: false,
    muteCelebrationSounds: false,
    lists: [
      { listId: 1, name: "Col A", order: 0, emoji: null },
      { listId: 2, name: "Col B", order: 1, emoji: null },
    ],
    tasks: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildTestList(overrides: Partial<List> = {}): List {
  return {
    listId: 1,
    name: "List",
    order: 0,
    emoji: null,
    ...overrides,
  };
}

export function buildTestTask(overrides: Partial<Task> = {}): Task {
  const now = "2020-01-01T00:00:00.000Z";
  return {
    taskId: 1,
    listId: 1,
    title: "Task",
    body: "",
    groupId: 0,
    priorityId: 5,
    status: "open",
    order: 0,
    emoji: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildTaskEditorBoardData(
  board?: Board,
): TaskEditorBoardData {
  return taskEditorBoardData(board ?? buildTestBoard());
}

/** Subset of {@link Board} used by board shortcuts — avoids building a full board for shortcut tests. */
export function buildBoardShortcutBoard(
  overrides: Partial<BoardShortcutBoard> = {},
): BoardShortcutBoard {
  const b = buildTestBoard();
  return {
    boardId: b.boardId,
    boardLayout: b.boardLayout ?? "stacked",
    defaultReleaseId: b.defaultReleaseId,
    releases: b.releases,
    showStats: b.showStats,
    taskGroups: b.taskGroups,
    taskPriorities: b.taskPriorities,
    tasks: b.tasks,
    ...overrides,
  };
}

/** All {@link BoardShortcutActions} as Vitest mocks for shortcut tests. */
export function createMockBoardShortcutActions(): BoardShortcutActions {
  return {
    openHelp: vi.fn(),
    openBoardSearch: vi.fn(),
    toggleFilters: vi.fn(),
    cycleTaskCardViewMode: vi.fn(),
    toggleBoardLayout: vi.fn(),
    cycleTaskGroup: vi.fn(),
    allTaskGroups: vi.fn(),
    cycleTaskPriority: vi.fn(),
    cycleHighlightedTaskGroup: vi.fn(),
    cycleHighlightedTaskPriority: vi.fn(),
    focusOrScrollHighlight: vi.fn(),
    moveHighlight: vi.fn(),
    highlightHome: vi.fn(),
    highlightEnd: vi.fn(),
    highlightPage: vi.fn(),
    openHighlightedTask: vi.fn(),
    editHighlightedTaskTitle: vi.fn(),
    requestDeleteHighlight: vi.fn(),
    addTaskAtHighlight: vi.fn(),
    addListAfterHighlight: vi.fn(),
    completeHighlightedTask: vi.fn(),
    toggleBoardStats: vi.fn(),
    reopenHighlightedTask: vi.fn(),
    assignDefaultReleaseToHighlightedTask: vi.fn(),
  } as BoardShortcutActions;
}

export function buildNotificationsPage(
  overrides: Partial<NotificationsPage> = {},
): NotificationsPage {
  return {
    items: [],
    unreadCount: 0,
    nextCursor: null,
    ...overrides,
  };
}
