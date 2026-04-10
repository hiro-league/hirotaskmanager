import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { replaceDbForTesting, getDb } from "../db";
import { runPendingMigrations } from "../migrations/runner";
import { createBoardWithDefaults, readBoardIndex, trashBoardById } from "./board";
import { createListOnBoard, deleteListOnBoard, restoreListOnBoard } from "./lists";
import { readTrashedBoards } from "./trash";

beforeAll(() => {
  const mem = new Database(":memory:");
  mem.run("PRAGMA foreign_keys = ON");
  runPendingMigrations(mem);
  replaceDbForTesting(mem);
});

afterAll(() => {
  replaceDbForTesting(null);
});

describe("trash phase 2 (writes + trash reads)", () => {
  test("trashBoardById removes board from live index and appears in trashed boards", async () => {
    const board = await createBoardWithDefaults("TB", "tb-slug", null, "", {
      cliBootstrap: "cli_full",
    });
    expect(
      (await readBoardIndex()).some((e) => e.boardId === board.boardId),
    ).toBe(true);
    const t = trashBoardById(board.boardId);
    expect(t).not.toBeNull();
    expect(
      (await readBoardIndex()).some((e) => e.boardId === board.boardId),
    ).toBe(false);
    const trashed = readTrashedBoards();
    expect(trashed.some((b) => b.boardId === board.boardId)).toBe(true);
  });

  test("restoreListOnBoard returns conflict when parent board is trashed", async () => {
    const board = await createBoardWithDefaults("PB", "pb-slug", null, "", {
      cliBootstrap: "cli_full",
    });
    const lr = createListOnBoard(board.boardId, { name: "L1" });
    expect(lr).not.toBeNull();
    const listId = lr!.list.listId;
    expect(deleteListOnBoard(board.boardId, listId)).not.toBeNull();
    const ts = new Date().toISOString();
    getDb().run("UPDATE board SET deleted_at = ? WHERE id = ?", [ts, board.boardId]);

    const out = restoreListOnBoard(board.boardId, listId);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected conflict");
    expect(out.reason).toBe("conflict");
  });
});
