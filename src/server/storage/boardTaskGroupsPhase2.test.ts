import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { replaceDbForTesting } from "../db";
import { runPendingMigrations } from "../migrations/runner";
import {
  createBoardWithDefaults,
  loadBoard,
  patchBoardTaskGroupConfig,
} from "./board";
import { createListOnBoard } from "./lists";
import { createTaskOnBoard } from "./tasks";
import type { PatchBoardTaskGroupConfigInput } from "../../shared/taskGroupConfig";

beforeAll(() => {
  const mem = new Database(":memory:");
  mem.run("PRAGMA foreign_keys = ON");
  runPendingMigrations(mem);
  replaceDbForTesting(mem);
});

afterAll(() => {
  replaceDbForTesting(null);
});

function configWithDefaults(
  board: NonNullable<ReturnType<typeof loadBoard>>,
  partial: Partial<PatchBoardTaskGroupConfigInput>,
): PatchBoardTaskGroupConfigInput {
  return {
    defaultTaskGroupId:
      partial.defaultTaskGroupId ?? board.defaultTaskGroupId,
    deletedGroupFallbackId:
      partial.deletedGroupFallbackId ?? board.deletedGroupFallbackId,
    creates: partial.creates ?? [],
    updates: partial.updates ?? [],
    deletes: partial.deletes ?? [],
    defaultTaskGroupClientId: partial.defaultTaskGroupClientId,
    deletedGroupFallbackClientId: partial.deletedGroupFallbackClientId,
  };
}

describe("task groups phase 2 (explicit PATCH /groups)", () => {
  test("updates labels and preserves ids", async () => {
    const board = await createBoardWithDefaults("P2A", "p2-a", null, "", {
      cliBootstrap: "cli_full",
    });
    const g = board.taskGroups;
    const saved = patchBoardTaskGroupConfig(
      board.boardId,
      configWithDefaults(board, {
        updates: g.map((x, i) => ({
          groupId: x.groupId,
          label: `${x.label}-x`,
          emoji: x.emoji ?? null,
          sortOrder: i,
        })),
      }),
    )!;
    expect(saved.taskGroups.map((x) => x.label)).toEqual(
      g.map((x) => `${x.label}-x`),
    );
    expect(saved.taskGroups.map((x) => x.groupId)).toEqual(
      g.map((x) => x.groupId),
    );
  });

  test("delete one group and reassign tasks", async () => {
    const board = await createBoardWithDefaults("P2B", "p2-b", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.boardId, { name: "L" })!;
    const [g0, g1, g2] = board.taskGroups;
    createTaskOnBoard(board.boardId, {
      listId: lr.list.listId,
      status: "open",
      title: "t",
      body: "",
      groupId: g2.groupId,
    });

    const surviving = [g0, g1];
    const saved = patchBoardTaskGroupConfig(
      board.boardId,
      configWithDefaults(board, {
        updates: surviving.map((x, i) => ({
          groupId: x.groupId,
          label: x.label,
          emoji: x.emoji ?? null,
          sortOrder: i,
        })),
        deletes: [{ groupId: g2.groupId, moveTasksToGroupId: g0.groupId }],
        defaultTaskGroupId: g0.groupId,
        deletedGroupFallbackId: g0.groupId,
      }),
    )!;
    expect(saved.taskGroups.map((x) => x.groupId)).toEqual([
      g0.groupId,
      g1.groupId,
    ]);
    const t = saved.tasks.find((x) => x.title === "t")!;
    expect(t.groupId).toBe(g0.groupId);
  });

  test("reject deleting all groups without creates", async () => {
    const board = await createBoardWithDefaults("P2C", "p2-c", null, "", {
      cliBootstrap: "cli_full",
    });
    const [g0, g1, g2] = board.taskGroups;
    expect(() =>
      patchBoardTaskGroupConfig(board.boardId, {
        creates: [],
        updates: [],
        deletes: [
          { groupId: g0.groupId, moveTasksToGroupId: g1.groupId },
          { groupId: g1.groupId, moveTasksToGroupId: g2.groupId },
          { groupId: g2.groupId, moveTasksToGroupId: g0.groupId },
        ],
        defaultTaskGroupId: g0.groupId,
        deletedGroupFallbackId: g0.groupId,
      }),
    ).toThrow(/surviving/);
  });

  test("create and delete in one save", async () => {
    const board = await createBoardWithDefaults("P2D", "p2-d", null, "", {
      cliBootstrap: "cli_full",
    });
    const [g0, g1, g2] = board.taskGroups;
    const saved = patchBoardTaskGroupConfig(board.boardId, {
      creates: [
        {
          clientId: "n1",
          label: "newgrp",
          emoji: null,
          sortOrder: 10,
        },
      ],
      updates: [
        { groupId: g0.groupId, label: g0.label, emoji: g0.emoji ?? null, sortOrder: 0 },
        { groupId: g1.groupId, label: g1.label, emoji: g1.emoji ?? null, sortOrder: 1 },
      ],
      deletes: [{ groupId: g2.groupId, moveTasksToGroupId: g0.groupId }],
      defaultTaskGroupId: g0.groupId,
      deletedGroupFallbackId: g0.groupId,
    })!;
    expect(saved.taskGroups.some((x) => x.label === "newgrp")).toBe(true);
    expect(saved.taskGroups.some((x) => x.groupId === g2.groupId)).toBe(false);
  });

  test("reject update and delete same id", async () => {
    const board = await createBoardWithDefaults("P2E", "p2-e", null, "", {
      cliBootstrap: "cli_full",
    });
    const g0 = board.taskGroups[0]!;
    expect(() =>
      patchBoardTaskGroupConfig(
        board.boardId,
        configWithDefaults(board, {
          updates: [
            {
              groupId: g0.groupId,
              label: "x",
              emoji: null,
              sortOrder: 0,
            },
          ],
          deletes: [
            {
              groupId: g0.groupId,
              moveTasksToGroupId: board.taskGroups[1]!.groupId,
            },
          ],
        }),
      ),
    ).toThrow(/update and delete/);
  });

  test("delete with moveTasksToClientId sends tasks to a new group", async () => {
    const board = await createBoardWithDefaults("P2G", "p2-g", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.boardId, { name: "L" })!;
    const [g0, g1, g2] = board.taskGroups;
    createTaskOnBoard(board.boardId, {
      listId: lr.list.listId,
      status: "open",
      title: "sinkme",
      body: "",
      groupId: g2.groupId,
    });
    const saved = patchBoardTaskGroupConfig(board.boardId, {
      creates: [
        { clientId: "sink", label: "Sink", emoji: null, sortOrder: 3 },
      ],
      updates: [
        { groupId: g0.groupId, label: g0.label, emoji: g0.emoji ?? null, sortOrder: 0 },
        { groupId: g1.groupId, label: g1.label, emoji: g1.emoji ?? null, sortOrder: 1 },
      ],
      deletes: [{ groupId: g2.groupId, moveTasksToClientId: "sink" }],
      defaultTaskGroupId: g0.groupId,
      deletedGroupFallbackId: g0.groupId,
    })!;
    const sink = saved.taskGroups.find((x) => x.label === "Sink");
    expect(sink).toBeDefined();
    const t = saved.tasks.find((x) => x.title === "sinkme")!;
    expect(t.groupId).toBe(sink!.groupId);
  });

  test("defaultTaskGroupClientId resolves to a group created in the same save", async () => {
    const board = await createBoardWithDefaults("P2F", "p2-f", null, "", {
      cliBootstrap: "cli_full",
    });
    const [g0, g1, g2] = board.taskGroups;
    const saved = patchBoardTaskGroupConfig(board.boardId, {
      creates: [
        { clientId: "new1", label: "Fresh", emoji: null, sortOrder: 3 },
      ],
      updates: [
        { groupId: g0.groupId, label: g0.label, emoji: g0.emoji ?? null, sortOrder: 0 },
        { groupId: g1.groupId, label: g1.label, emoji: g1.emoji ?? null, sortOrder: 1 },
        { groupId: g2.groupId, label: g2.label, emoji: g2.emoji ?? null, sortOrder: 2 },
      ],
      deletes: [],
      defaultTaskGroupClientId: "new1",
      deletedGroupFallbackId: g0.groupId,
    })!;
    const fresh = saved.taskGroups.find((x) => x.label === "Fresh");
    expect(fresh).toBeDefined();
    expect(saved.defaultTaskGroupId).toBe(fresh!.groupId);
  });
});
