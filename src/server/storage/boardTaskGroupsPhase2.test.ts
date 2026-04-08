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
      board.id,
      configWithDefaults(board, {
        updates: g.map((x, i) => ({
          id: x.id,
          label: `${x.label}-x`,
          emoji: x.emoji ?? null,
          sortOrder: i,
        })),
      }),
    )!;
    expect(saved.taskGroups.map((x) => x.label)).toEqual(
      g.map((x) => `${x.label}-x`),
    );
    expect(saved.taskGroups.map((x) => x.id)).toEqual(g.map((x) => x.id));
  });

  test("delete one group and reassign tasks", async () => {
    const board = await createBoardWithDefaults("P2B", "p2-b", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.id, { name: "L" })!;
    const [g0, g1, g2] = board.taskGroups;
    createTaskOnBoard(board.id, {
      listId: lr.list.id,
      status: "open",
      title: "t",
      body: "",
      groupId: g2.id,
    });

    const surviving = [g0, g1];
    const saved = patchBoardTaskGroupConfig(
      board.id,
      configWithDefaults(board, {
        updates: surviving.map((x, i) => ({
          id: x.id,
          label: x.label,
          emoji: x.emoji ?? null,
          sortOrder: i,
        })),
        deletes: [{ id: g2.id, moveTasksToGroupId: g0.id }],
        defaultTaskGroupId: g0.id,
        deletedGroupFallbackId: g0.id,
      }),
    )!;
    expect(saved.taskGroups.map((x) => x.id)).toEqual([g0.id, g1.id]);
    const t = saved.tasks.find((x) => x.title === "t")!;
    expect(t.groupId).toBe(g0.id);
  });

  test("reject deleting all groups without creates", async () => {
    const board = await createBoardWithDefaults("P2C", "p2-c", null, "", {
      cliBootstrap: "cli_full",
    });
    const [g0, g1, g2] = board.taskGroups;
    expect(() =>
      patchBoardTaskGroupConfig(board.id, {
        creates: [],
        updates: [],
        deletes: [
          { id: g0.id, moveTasksToGroupId: g1.id },
          { id: g1.id, moveTasksToGroupId: g2.id },
          { id: g2.id, moveTasksToGroupId: g0.id },
        ],
        defaultTaskGroupId: g0.id,
        deletedGroupFallbackId: g0.id,
      }),
    ).toThrow(/surviving/);
  });

  test("create and delete in one save", async () => {
    const board = await createBoardWithDefaults("P2D", "p2-d", null, "", {
      cliBootstrap: "cli_full",
    });
    const [g0, g1, g2] = board.taskGroups;
    const saved = patchBoardTaskGroupConfig(board.id, {
      creates: [
        {
          clientId: "n1",
          label: "newgrp",
          emoji: null,
          sortOrder: 10,
        },
      ],
      updates: [
        { id: g0.id, label: g0.label, emoji: g0.emoji ?? null, sortOrder: 0 },
        { id: g1.id, label: g1.label, emoji: g1.emoji ?? null, sortOrder: 1 },
      ],
      deletes: [{ id: g2.id, moveTasksToGroupId: g0.id }],
      defaultTaskGroupId: g0.id,
      deletedGroupFallbackId: g0.id,
    })!;
    expect(saved.taskGroups.some((x) => x.label === "newgrp")).toBe(true);
    expect(saved.taskGroups.some((x) => x.id === g2.id)).toBe(false);
  });

  test("reject update and delete same id", async () => {
    const board = await createBoardWithDefaults("P2E", "p2-e", null, "", {
      cliBootstrap: "cli_full",
    });
    const g0 = board.taskGroups[0]!;
    expect(() =>
      patchBoardTaskGroupConfig(
        board.id,
        configWithDefaults(board, {
          updates: [
            {
              id: g0.id,
              label: "x",
              emoji: null,
              sortOrder: 0,
            },
          ],
          deletes: [{ id: g0.id, moveTasksToGroupId: board.taskGroups[1]!.id }],
        }),
      ),
    ).toThrow(/update and delete/);
  });

  test("delete with moveTasksToClientId sends tasks to a new group", async () => {
    const board = await createBoardWithDefaults("P2G", "p2-g", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.id, { name: "L" })!;
    const [g0, g1, g2] = board.taskGroups;
    createTaskOnBoard(board.id, {
      listId: lr.list.id,
      status: "open",
      title: "sinkme",
      body: "",
      groupId: g2.id,
    });
    const saved = patchBoardTaskGroupConfig(board.id, {
      creates: [
        { clientId: "sink", label: "Sink", emoji: null, sortOrder: 3 },
      ],
      updates: [
        { id: g0.id, label: g0.label, emoji: g0.emoji ?? null, sortOrder: 0 },
        { id: g1.id, label: g1.label, emoji: g1.emoji ?? null, sortOrder: 1 },
      ],
      deletes: [{ id: g2.id, moveTasksToClientId: "sink" }],
      defaultTaskGroupId: g0.id,
      deletedGroupFallbackId: g0.id,
    })!;
    const sink = saved.taskGroups.find((x) => x.label === "Sink");
    expect(sink).toBeDefined();
    const t = saved.tasks.find((x) => x.title === "sinkme")!;
    expect(t.groupId).toBe(sink!.id);
  });

  test("defaultTaskGroupClientId resolves to a group created in the same save", async () => {
    const board = await createBoardWithDefaults("P2F", "p2-f", null, "", {
      cliBootstrap: "cli_full",
    });
    const [g0, g1, g2] = board.taskGroups;
    const saved = patchBoardTaskGroupConfig(board.id, {
      creates: [
        { clientId: "new1", label: "Fresh", emoji: null, sortOrder: 3 },
      ],
      updates: [
        { id: g0.id, label: g0.label, emoji: g0.emoji ?? null, sortOrder: 0 },
        { id: g1.id, label: g1.label, emoji: g1.emoji ?? null, sortOrder: 1 },
        { id: g2.id, label: g2.label, emoji: g2.emoji ?? null, sortOrder: 2 },
      ],
      deletes: [],
      defaultTaskGroupClientId: "new1",
      deletedGroupFallbackId: g0.id,
    })!;
    const fresh = saved.taskGroups.find((x) => x.label === "Fresh");
    expect(fresh).toBeDefined();
    expect(saved.defaultTaskGroupId).toBe(fresh!.id);
  });
});
