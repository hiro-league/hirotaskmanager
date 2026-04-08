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
    const a = createBoardRelease(board.id, { name: "v1.0" });
    expect(a).not.toBeNull();
    expect(a!.name).toBe("v1.0");
    const dup = createBoardRelease(board.id, { name: "v1.0" });
    expect(dup).toBeNull();
    const loaded = loadBoard(board.id)!;
    expect(loaded.releases.some((r) => r.name === "v1.0")).toBe(true);
  });

  test("delete release clears tasks or moves to another release", async () => {
    const board = await createBoardWithDefaults("R2", "r2", null, "", {
      cliBootstrap: "cli_full",
    });
    const list = createListOnBoard(board.id, { name: "L" })!;
    const r1 = createBoardRelease(board.id, { name: "A" })!;
    const r2 = createBoardRelease(board.id, { name: "B" })!;
    const g = board.taskGroups[0]!.id;
    const t1 = createTaskOnBoard(
      board.id,
      {
        listId: list.list.id,
        groupId: g,
        title: "t",
        body: "",
        status: "open",
        releaseId: r1.id,
      },
      { principal: "web", label: null },
    )!;
    expect(t1.task.releaseId).toBe(r1.id);

    deleteBoardRelease(board.id, r1.id, { moveTasksToReleaseId: r2.id });
    const db = getDb();
    const rid = db
      .query("SELECT release_id FROM task WHERE id = ?")
      .get(t1.task.id) as { release_id: number | null };
    expect(rid.release_id).toBe(r2.id);

    const t2 = createTaskOnBoard(
      board.id,
      {
        listId: list.list.id,
        groupId: g,
        title: "t2",
        body: "",
        status: "open",
        releaseId: r2.id,
      },
      { principal: "web", label: null },
    )!;
    deleteBoardRelease(board.id, r2.id, {});
    const rid2 = db
      .query("SELECT release_id FROM task WHERE id = ?")
      .get(t2.task.id) as { release_id: number | null };
    expect(rid2.release_id).toBeNull();
  });

  test("auto-assign on create: web + cli vs explicit null", async () => {
    const board = await createBoardWithDefaults("R3", "r3", null, "", {
      cliBootstrap: "cli_full",
    });
    const list = createListOnBoard(board.id, { name: "L" })!;
    const rel = createBoardRelease(board.id, { name: "Sprint" })!;
    const g = board.taskGroups[0]!.id;

    await patchBoard(board.id, {
      defaultReleaseId: rel.id,
      autoAssignReleaseOnCreateUi: true,
      autoAssignReleaseOnCreateCli: true,
    });

    const tw = createTaskOnBoard(
      board.id,
      {
        listId: list.list.id,
        groupId: g,
        title: "w",
        body: "",
        status: "open",
      },
      { principal: "web", label: null },
    )!;
    expect(tw.task.releaseId).toBe(rel.id);

    const tc = createTaskOnBoard(
      board.id,
      {
        listId: list.list.id,
        groupId: g,
        title: "c",
        body: "",
        status: "open",
      },
      { principal: "cli", label: null },
    )!;
    expect(tc.task.releaseId).toBe(rel.id);

    const tn = createTaskOnBoard(
      board.id,
      {
        listId: list.list.id,
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
    const list = createListOnBoard(board.id, { name: "L" })!;
    const rel = createBoardRelease(board.id, { name: "Rel" })!;
    const g = board.taskGroups[0]!.id;
    await patchBoard(board.id, {
      defaultReleaseId: rel.id,
      autoAssignReleaseOnCreateUi: false,
      autoAssignReleaseOnCreateCli: false,
    });
    const t = createTaskOnBoard(
      board.id,
      {
        listId: list.list.id,
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
    const list = createListOnBoard(board.id, { name: "L" })!;
    const rel = createBoardRelease(board.id, { name: "S" })!;
    const g = board.taskGroups[0]!.id;
    await patchBoard(board.id, {
      defaultReleaseId: rel.id,
      autoAssignReleaseOnCreateUi: true,
      autoAssignReleaseOnCreateCli: false,
    });
    const tw = createTaskOnBoard(
      board.id,
      {
        listId: list.list.id,
        groupId: g,
        title: "w",
        body: "",
        status: "open",
      },
      { principal: "web", label: null },
    )!;
    expect(tw.task.releaseId).toBe(rel.id);
    const tc = createTaskOnBoard(
      board.id,
      {
        listId: list.list.id,
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
    createListOnBoard(a.id, { name: "LA" })!;
    const listB = createListOnBoard(b.id, { name: "LB" })!;
    const relA = createBoardRelease(a.id, { name: "onlyA" })!;
    const gB = b.taskGroups[0]!.id;
    const badCreate = createTaskOnBoard(
      b.id,
      {
        listId: listB.list.id,
        groupId: gB,
        title: "t",
        body: "",
        status: "open",
        releaseId: relA.id,
      },
      { principal: "web", label: null },
    );
    expect(badCreate).toBeNull();

    const onB = createTaskOnBoard(
      b.id,
      {
        listId: listB.list.id,
        groupId: gB,
        title: "t2",
        body: "",
        status: "open",
      },
      { principal: "web", label: null },
    )!;
    const badPatch = patchTaskOnBoard(b.id, onB.task.id, {
      releaseId: relA.id,
    });
    expect(badPatch).toBeNull();
  });
});
