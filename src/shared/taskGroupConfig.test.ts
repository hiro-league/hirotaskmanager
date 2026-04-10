import { describe, expect, test } from "bun:test";
import { EMPTY_BOARD_CLI_POLICY } from "./cliPolicy";
import type { Board } from "./models";
import {
  buildPatchBoardTaskGroupConfigFromEditor,
  parsePatchBoardTaskGroupConfigBody,
  type TaskGroupEditorRow,
  type TaskGroupSelection,
} from "./taskGroupConfig";

const minimalBoard = (
  overrides: Partial<Board> & Pick<Board, "boardId" | "taskGroups">,
): Board =>
  ({
    name: "T",
    cliPolicy: EMPTY_BOARD_CLI_POLICY,
    taskPriorities: [],
    releases: [],
    defaultReleaseId: null,
    autoAssignReleaseOnCreateUi: false,
    autoAssignReleaseOnCreateCli: false,
    visibleStatuses: ["open"],
    lists: [],
    tasks: [],
    showStats: false,
    muteCelebrationSounds: false,
    createdAt: "",
    updatedAt: "",
    defaultTaskGroupId: 10,
    deletedGroupFallbackId: 10,
    ...overrides,
  }) as Board;

describe("buildPatchBoardTaskGroupConfigFromEditor", () => {
  const board = minimalBoard({
    boardId: 1,
    taskGroups: [
      { groupId: 10, label: "A", emoji: null, sortOrder: 0 },
      { groupId: 11, label: "B", emoji: null, sortOrder: 1 },
    ],
    defaultTaskGroupId: 10,
    deletedGroupFallbackId: 10,
  });

  const defaultA: TaskGroupSelection = { kind: "id", id: 10 };

  test("default group + fallback from star; creates with empty delete map", () => {
    const rows: TaskGroupEditorRow[] = [
      { clientId: "c10", groupId: 10, label: "A", emoji: null, sortOrder: 0 },
      { clientId: "c11", groupId: 11, label: "B", emoji: null, sortOrder: 1 },
      { clientId: "new1", groupId: 12, label: "New", emoji: null, sortOrder: 2 },
    ];
    const patch = buildPatchBoardTaskGroupConfigFromEditor(board, rows, {
      defaultGroup: defaultA,
      deleteMoves: new Map(),
    });
    expect(patch.defaultTaskGroupId).toBe(10);
    expect(patch.deletedGroupFallbackId).toBe(10);
    expect(patch.deletes).toEqual([]);
    expect(patch.creates?.some((c) => c.clientId === "new1")).toBe(true);
  });

  test("delete with explicit move to new row (clientId)", () => {
    const rows: TaskGroupEditorRow[] = [
      { clientId: "c10", groupId: 10, label: "A", emoji: null, sortOrder: 0 },
      { clientId: "sink", groupId: 12, label: "Sink", emoji: null, sortOrder: 1 },
    ];
    const sink: TaskGroupSelection = { kind: "clientId", clientId: "sink" };
    const patch = buildPatchBoardTaskGroupConfigFromEditor(board, rows, {
      defaultGroup: defaultA,
      deleteMoves: new Map([[11, sink]]),
    });
    expect(patch.defaultTaskGroupId).toBe(10);
    expect(patch.deletedGroupFallbackId).toBe(10);
    expect(patch.deletes).toEqual([
      { groupId: 11, moveTasksToClientId: "sink" },
    ]);
  });

  test("delete empty group may omit move (null in map)", () => {
    const rows: TaskGroupEditorRow[] = [
      { clientId: "c10", groupId: 10, label: "A", emoji: null, sortOrder: 0 },
    ];
    const patch = buildPatchBoardTaskGroupConfigFromEditor(board, rows, {
      defaultGroup: defaultA,
      deleteMoves: new Map([[11, null]]),
    });
    expect(patch.deletes).toEqual([{ groupId: 11 }]);
  });
});

describe("parsePatchBoardTaskGroupConfigBody (Phase 4 CLI/API contract)", () => {
  test("rejects legacy taskGroups replacement array", () => {
    const r = parsePatchBoardTaskGroupConfigBody({
      taskGroups: [{ id: 1, label: "x" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Legacy taskGroups");
    }
  });

  test("accepts minimal explicit payload shape", () => {
    const r = parsePatchBoardTaskGroupConfigBody({
      creates: [],
      updates: [],
      deletes: [],
      defaultTaskGroupId: 1,
      deletedGroupFallbackId: 1,
    });
    expect(r.ok).toBe(true);
  });
});
