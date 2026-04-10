import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { replaceDbForTesting } from "../db";
import { runPendingMigrations } from "../migrations/runner";
import { BOARD_FETCH_SLIM_TASK_BODY_CHARS } from "../../shared/boardPayload";
import { createBoardWithDefaults, loadBoard } from "./board";
import { createListOnBoard } from "./lists";
import { createTaskOnBoard } from "./tasks";

beforeAll(() => {
  const mem = new Database(":memory:");
  mem.run("PRAGMA foreign_keys = ON");
  runPendingMigrations(mem);
  replaceDbForTesting(mem);
});

afterAll(() => {
  replaceDbForTesting(null);
});

describe("loadBoard taskBodyMaxChars (slim board payload)", () => {
  test("SUBSTR limits task body bytes returned from SQLite", async () => {
    const board = await createBoardWithDefaults("Slim", "slim-board", null, "", {
      cliBootstrap: "cli_full",
    });
    const listRes = createListOnBoard(board.boardId, { name: "L1" });
    expect(listRes).not.toBeNull();
    const listId = listRes!.list.listId;
    const full = loadBoard(board.boardId)!;
    const groupId = full.taskGroups[0]!.groupId;
    const longBody = "x".repeat(500);
    const created = createTaskOnBoard(
      board.boardId,
      {
        listId,
        status: "open",
        title: "T",
        body: longBody,
        groupId,
      },
      undefined,
    );
    expect(created).not.toBeNull();

    const loadedFull = loadBoard(board.boardId)!;
    const row = loadedFull.tasks.find((t) => t.title === "T");
    expect(row?.body).toBe(longBody);

    const slim = loadBoard(board.boardId, {
      taskBodyMaxChars: BOARD_FETCH_SLIM_TASK_BODY_CHARS,
    })!;
    const slimRow = slim.tasks.find((t) => t.title === "T");
    expect(slimRow?.body).toBe(longBody.slice(0, BOARD_FETCH_SLIM_TASK_BODY_CHARS));
  });

  test("bodyPreview=0 yields empty task bodies", async () => {
    const board = await createBoardWithDefaults("Zero", "zero-body", null, "", {
      cliBootstrap: "cli_full",
    });
    const listRes = createListOnBoard(board.boardId, { name: "L2" });
    expect(listRes).not.toBeNull();
    const listId = listRes!.list.listId;
    const full = loadBoard(board.boardId)!;
    const groupId = full.taskGroups[0]!.groupId;
    createTaskOnBoard(
      board.boardId,
      {
        listId,
        status: "open",
        title: "Z",
        body: "hello",
        groupId,
      },
      undefined,
    );
    const z = loadBoard(board.boardId, { taskBodyMaxChars: 0 })!.tasks.find(
      (t) => t.title === "Z",
    );
    expect(z?.body).toBe("");
  });
});
