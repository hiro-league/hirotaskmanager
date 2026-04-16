import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { replaceDbForTesting, getDb } from "../../db";
import { runPendingMigrations } from "../../migrations/runner";
import { createBoardWithDefaults, loadBoard } from "./board";

beforeAll(() => {
  const mem = new Database(":memory:");
  mem.run("PRAGMA foreign_keys = ON");
  runPendingMigrations(mem);
  replaceDbForTesting(mem);
});

afterAll(() => {
  replaceDbForTesting(null);
});

describe("task groups phase 1 (sort_order + board defaults)", () => {
  test("createBoardWithDefaults seeds sort_order, defaultTaskGroupId, deletedGroupFallbackId", async () => {
    const board = await createBoardWithDefaults("G1", "g1", null, "", {
      cliBootstrap: "cli_full",
    });
    expect(board.taskGroups.length).toBe(3);
    expect(board.taskGroups.map((g) => g.sortOrder)).toEqual([0, 1, 2]);
    const firstId = board.taskGroups[0]!.groupId;
    expect(board.defaultTaskGroupId).toBe(firstId);
    expect(board.deletedGroupFallbackId).toBe(firstId);

    const loaded = loadBoard(board.boardId)!;
    expect(loaded.taskGroups.map((g) => g.sortOrder)).toEqual([0, 1, 2]);
    expect(loaded.defaultTaskGroupId).toBe(firstId);
    expect(loaded.deletedGroupFallbackId).toBe(firstId);
  });

  test("loadBoard orders groups by sort_order then groupId", async () => {
    const board = await createBoardWithDefaults("G2", "g2", null, "", {
      cliBootstrap: "cli_full",
    });
    const db = getDb();
    const rows = db
      .query(
        "SELECT id FROM task_group WHERE board_id = ? ORDER BY id ASC",
      )
      .all(board.boardId) as { id: number }[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const [a, b] = [rows[0]!.id, rows[1]!.id];
    // Swap sort_order so row id order differs from display order.
    db.run("UPDATE task_group SET sort_order = ? WHERE id = ?", [1, a]);
    db.run("UPDATE task_group SET sort_order = ? WHERE id = ?", [0, b]);

    const loaded = loadBoard(board.boardId)!;
    expect(loaded.taskGroups[0]!.groupId).toBe(b);
    expect(loaded.taskGroups[1]!.groupId).toBe(a);
  });
});
