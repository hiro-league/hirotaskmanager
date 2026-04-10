import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { replaceDbForTesting, getDb } from "../db";
import { runPendingMigrations } from "../migrations/runner";
import {
  createBoardWithDefaults,
  readBoardIndex,
  entryByIdOrSlug,
  loadBoard,
} from "./board";
import { createListOnBoard, readListById } from "./lists";
import { createTaskOnBoard, readTaskById } from "./tasks";
import { searchTasks } from "./search";

beforeAll(() => {
  const mem = new Database(":memory:");
  mem.run("PRAGMA foreign_keys = ON");
  runPendingMigrations(mem);
  replaceDbForTesting(mem);
});

afterAll(() => {
  replaceDbForTesting(null);
});

describe("trash active reads (phase 1)", () => {
  test("trashed board is excluded from index, lookup, and loadBoard", async () => {
    const board = await createBoardWithDefaults("TrashBoard", "trash-board", null, "", {
      cliBootstrap: "cli_full",
    });
    expect(
      (await readBoardIndex()).some((e) => e.boardId === board.boardId),
    ).toBe(true);

    const ts = new Date().toISOString();
    getDb().run("UPDATE board SET deleted_at = ? WHERE id = ?", [ts, board.boardId]);

    expect(await readBoardIndex()).toEqual([]);
    expect(await entryByIdOrSlug(String(board.boardId))).toBeNull();
    expect(await entryByIdOrSlug("trash-board")).toBeNull();
    expect(loadBoard(board.boardId)).toBeNull();
  });

  test("trashed list and its tasks are hidden from loadBoard; readListById is null", async () => {
    const board = await createBoardWithDefaults("LBoard", "l-board", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.boardId, { name: "L1" });
    expect(lr).not.toBeNull();
    const listId = lr!.list.listId;
    const groupId = board.taskGroups[0]!.groupId;
    const tr = createTaskOnBoard(board.boardId, {
      listId,
      status: "open",
      title: "t1",
      body: "",
      groupId,
    });
    expect(tr).not.toBeNull();
    const taskId = tr!.task.taskId;

    expect(
      loadBoard(board.boardId)!.lists.some((l) => l.listId === listId),
    ).toBe(true);
    expect(
      loadBoard(board.boardId)!.tasks.some((t) => t.taskId === taskId),
    ).toBe(true);

    getDb().run("UPDATE list SET deleted_at = ? WHERE id = ?", [
      new Date().toISOString(),
      listId,
    ]);

    const loaded = loadBoard(board.boardId)!;
    expect(loaded.lists.some((l) => l.listId === listId)).toBe(false);
    expect(loaded.tasks.some((t) => t.taskId === taskId)).toBe(false);
    expect(readListById(board.boardId, listId)).toBeNull();
    expect(readTaskById(board.boardId, taskId)).toBeNull();
  });

  test("trashed task is hidden from readTaskById and FTS", async () => {
    const board = await createBoardWithDefaults("SBoard", "s-board", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.boardId, { name: "L1" });
    const listId = lr!.list.listId;
    const groupId = board.taskGroups[0]!.groupId;
    const tr = createTaskOnBoard(board.boardId, {
      listId,
      status: "open",
      title: "uniqueftstoken",
      body: "",
      groupId,
    });
    const taskId = tr!.task.taskId;

    expect(searchTasks({ q: "uniqueftstoken", boardId: board.boardId }).length).toBeGreaterThan(0);

    getDb().run("UPDATE task SET deleted_at = ? WHERE id = ?", [
      new Date().toISOString(),
      taskId,
    ]);

    expect(readTaskById(board.boardId, taskId)).toBeNull();
    expect(searchTasks({ q: "uniqueftstoken", boardId: board.boardId })).toEqual([]);
  });
});
