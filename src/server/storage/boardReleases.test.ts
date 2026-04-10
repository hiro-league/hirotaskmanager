import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { replaceDbForTesting, getDb } from "../db";
import { runPendingMigrations } from "../migrations/runner";
import { createBoardWithDefaults, loadBoard, patchBoard } from "./board";
import { createBoardRelease, deleteBoardRelease } from "./releases";
import { createListOnBoard } from "./lists";
import { createTaskOnBoard, patchTaskOnBoard } from "./tasks";

beforeAll(() => {
  const mem = new Database(":memory:");
  mem.run("PRAGMA foreign_keys = ON");
  runPendingMigrations(mem);
  replaceDbForTesting(mem);
});

afterAll(() => {
  replaceDbForTesting(null);
});

describe("board releases (phase 1–2)", () => {
  test("new board has empty releases and null default", async () => {
    const board = await createBoardWithDefaults("R0", "r0", null, "", {
      cliBootstrap: "cli_full",
    });
    expect(board.releases).toEqual([]);
    expect(board.defaultReleaseId).toBeNull();
    expect(board.autoAssignReleaseOnCreateUi).toBe(false);
    expect(board.autoAssignReleaseOnCreateCli).toBe(false);
  });

  test("createBoardRelease + unique name per board", async () => {
    const board = await createBoardWithDefaults("R1", "r1", null, "", {
      cliBootstrap: "cli_full",
    });
    const a = createBoardRelease(board.boardId, { name: "v1.0" });
    expect(a).not.toBeNull();
    expect(a!.name).toBe("v1.0");
    const dup = createBoardRelease(board.boardId, { name: "v1.0" });
    expect(dup).toBeNull();
    const loaded = loadBoard(board.boardId)!;
    expect(loaded.releases.some((r) => r.name === "v1.0")).toBe(true);
  });

  test("delete release clears tasks or moves to another release", async () => {
    const board = await createBoardWithDefaults("R2", "r2", null, "", {
      cliBootstrap: "cli_full",
    });
    const list = createListOnBoard(board.boardId, { name: "L" })!;
    const r1 = createBoardRelease(board.boardId, { name: "A" })!;
    const r2 = createBoardRelease(board.boardId, { name: "B" })!;
    const g = board.taskGroups[0]!.groupId;
    const t1 = createTaskOnBoard(
      board.boardId,
      {
        listId: list.list.listId,
        groupId: g,
        title: "t",
        body: "",
        status: "open",
        releaseId: r1.releaseId,
      },
      { principal: "web", label: null },
    )!;
    expect(t1.task.releaseId).toBe(r1.releaseId);

    deleteBoardRelease(board.boardId, r1.releaseId, {
      moveTasksToReleaseId: r2.releaseId,
    });
    const db = getDb();
    const rid = db
      .query("SELECT release_id FROM task WHERE id = ?")
      .get(t1.task.taskId) as { release_id: number | null };
    expect(rid.release_id).toBe(r2.releaseId);

    const t2 = createTaskOnBoard(
      board.boardId,
      {
        listId: list.list.listId,
        groupId: g,
        title: "t2",
        body: "",
        status: "open",
        releaseId: r2.releaseId,
      },
      { principal: "web", label: null },
    )!;
    deleteBoardRelease(board.boardId, r2.releaseId, {});
    const rid2 = db
      .query("SELECT release_id FROM task WHERE id = ?")
      .get(t2.task.taskId) as { release_id: number | null };
    expect(rid2.release_id).toBeNull();
  });

  test("auto-assign on create: web + cli vs explicit null", async () => {
    const board = await createBoardWithDefaults("R3", "r3", null, "", {
      cliBootstrap: "cli_full",
    });
    const list = createListOnBoard(board.boardId, { name: "L" })!;
    const rel = createBoardRelease(board.boardId, { name: "Sprint" })!;
    const g = board.taskGroups[0]!.groupId;

    await patchBoard(board.boardId, {
      defaultReleaseId: rel.releaseId,
      autoAssignReleaseOnCreateUi: true,
      autoAssignReleaseOnCreateCli: true,
    });

    const tw = createTaskOnBoard(
      board.boardId,
      {
        listId: list.list.listId,
        groupId: g,
        title: "w",
        body: "",
        status: "open",
      },
      { principal: "web", label: null },
    )!;
    expect(tw.task.releaseId).toBe(rel.releaseId);

    const tc = createTaskOnBoard(
      board.boardId,
      {
        listId: list.list.listId,
        groupId: g,
        title: "c",
        body: "",
        status: "open",
      },
      { principal: "cli", label: null },
    )!;
    expect(tc.task.releaseId).toBe(rel.releaseId);

    const tn = createTaskOnBoard(
      board.boardId,
      {
        listId: list.list.listId,
        groupId: g,
        title: "n",
        body: "",
        status: "open",
        releaseId: null,
      },
      { principal: "web", label: null },
    )!;
    expect(tn.task.releaseId).toBeNull();
  });

  test("auto-assign off: default set but toggles false leaves new tasks untagged", async () => {
    const board = await createBoardWithDefaults("R4", "r4", null, "", {
      cliBootstrap: "cli_full",
    });
    const list = createListOnBoard(board.boardId, { name: "L" })!;
    const rel = createBoardRelease(board.boardId, { name: "Rel" })!;
    const g = board.taskGroups[0]!.groupId;
    await patchBoard(board.boardId, {
      defaultReleaseId: rel.releaseId,
      autoAssignReleaseOnCreateUi: false,
      autoAssignReleaseOnCreateCli: false,
    });
    const t = createTaskOnBoard(
      board.boardId,
      {
        listId: list.list.listId,
        groupId: g,
        title: "x",
        body: "",
        status: "open",
      },
      { principal: "web", label: null },
    )!;
    expect(t.task.releaseId).toBeNull();
  });

  test("auto-assign split: UI on, CLI off", async () => {
    const board = await createBoardWithDefaults("R5", "r5", null, "", {
      cliBootstrap: "cli_full",
    });
    const list = createListOnBoard(board.boardId, { name: "L" })!;
    const rel = createBoardRelease(board.boardId, { name: "S" })!;
    const g = board.taskGroups[0]!.groupId;
    await patchBoard(board.boardId, {
      defaultReleaseId: rel.releaseId,
      autoAssignReleaseOnCreateUi: true,
      autoAssignReleaseOnCreateCli: false,
    });
    const tw = createTaskOnBoard(
      board.boardId,
      {
        listId: list.list.listId,
        groupId: g,
        title: "w",
        body: "",
        status: "open",
      },
      { principal: "web", label: null },
    )!;
    expect(tw.task.releaseId).toBe(rel.releaseId);
    const tc = createTaskOnBoard(
      board.boardId,
      {
        listId: list.list.listId,
        groupId: g,
        title: "c",
        body: "",
        status: "open",
      },
      { principal: "cli", label: null },
    )!;
    expect(tc.task.releaseId).toBeNull();
  });

  test("reject release id from another board on create and patch", async () => {
    const a = await createBoardWithDefaults("RA", "ra", null, "", {
      cliBootstrap: "cli_full",
    });
    const b = await createBoardWithDefaults("RB", "rb", null, "", {
      cliBootstrap: "cli_full",
    });
    createListOnBoard(a.boardId, { name: "LA" })!;
    const listB = createListOnBoard(b.boardId, { name: "LB" })!;
    const relA = createBoardRelease(a.boardId, { name: "onlyA" })!;
    const gB = b.taskGroups[0]!.groupId;
    const badCreate = createTaskOnBoard(
      b.boardId,
      {
        listId: listB.list.listId,
        groupId: gB,
        title: "t",
        body: "",
        status: "open",
        releaseId: relA.releaseId,
      },
      { principal: "web", label: null },
    );
    expect(badCreate).toBeNull();

    const onB = createTaskOnBoard(
      b.boardId,
      {
        listId: listB.list.listId,
        groupId: gB,
        title: "t2",
        body: "",
        status: "open",
      },
      { principal: "web", label: null },
    )!;
    const badPatch = patchTaskOnBoard(b.boardId, onB.task.taskId, {
      releaseId: relA.releaseId,
    });
    expect(badPatch).toBeNull();
  });
});
