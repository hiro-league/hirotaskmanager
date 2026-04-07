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
    expect((await readBoardIndex()).some((e) => e.id === board.id)).toBe(true);

    const ts = new Date().toISOString();
    getDb().run("UPDATE board SET deleted_at = ? WHERE id = ?", [ts, board.id]);

    expect(await readBoardIndex()).toEqual([]);
    expect(await entryByIdOrSlug(String(board.id))).toBeNull();
    expect(await entryByIdOrSlug("trash-board")).toBeNull();
    expect(loadBoard(board.id)).toBeNull();
  });

  test("trashed list and its tasks are hidden from loadBoard; readListById is null", async () => {
    const board = await createBoardWithDefaults("LBoard", "l-board", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.id, { name: "L1" });
    expect(lr).not.toBeNull();
    const listId = lr!.list.id;
    const groupId = board.taskGroups[0]!.id;
    const tr = createTaskOnBoard(board.id, {
      listId,
      status: "open",
      title: "t1",
      body: "",
      groupId,
      priorityId: board.taskPriorities[0]?.id ?? null,
    });
    expect(tr).not.toBeNull();
    const taskId = tr!.task.id;

    expect(loadBoard(board.id)!.lists.some((l) => l.id === listId)).toBe(true);
    expect(loadBoard(board.id)!.tasks.some((t) => t.id === taskId)).toBe(true);

    getDb().run("UPDATE list SET deleted_at = ? WHERE id = ?", [
      new Date().toISOString(),
      listId,
    ]);

    const loaded = loadBoard(board.id)!;
    expect(loaded.lists.some((l) => l.id === listId)).toBe(false);
    expect(loaded.tasks.some((t) => t.id === taskId)).toBe(false);
    expect(readListById(board.id, listId)).toBeNull();
    expect(readTaskById(board.id, taskId)).toBeNull();
  });

  test("trashed task is hidden from readTaskById and FTS", async () => {
    const board = await createBoardWithDefaults("SBoard", "s-board", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.id, { name: "L1" });
    const listId = lr!.list.id;
    const groupId = board.taskGroups[0]!.id;
    const tr = createTaskOnBoard(board.id, {
      listId,
      status: "open",
      title: "uniqueftstoken",
      body: "",
      groupId,
      priorityId: board.taskPriorities[0]?.id ?? null,
    });
    const taskId = tr!.task.id;

    expect(searchTasks({ q: "uniqueftstoken", boardId: board.id }).length).toBeGreaterThan(0);

    getDb().run("UPDATE task SET deleted_at = ? WHERE id = ?", [
      new Date().toISOString(),
      taskId,
    ]);

    expect(readTaskById(board.id, taskId)).toBeNull();
    expect(searchTasks({ q: "uniqueftstoken", boardId: board.id })).toEqual([]);
  });
});
