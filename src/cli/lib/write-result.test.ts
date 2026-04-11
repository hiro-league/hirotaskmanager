import { describe, expect, test } from "bun:test";
import type { Board, List, ReleaseDefinition, Task } from "../../shared/models";
import {
  compactBoardEntity,
  compactListEntity,
  compactReleaseEntity,
  compactTaskEntity,
  trashedEntity,
  writeReleaseDelete,
  writeSuccess,
  writeTrashMove,
} from "./write-result";

describe("compact*Entity", () => {
  test("compactBoardEntity maps nullables", () => {
    const board = {
      boardId: 1,
      slug: undefined,
      name: "B",
      emoji: undefined,
      createdAt: "c",
      updatedAt: "u",
    } as unknown as Board;
    expect(compactBoardEntity(board)).toEqual({
      type: "board",
      boardId: 1,
      slug: "",
      name: "B",
      emoji: null,
      createdAt: "c",
      updatedAt: "u",
    });
  });

  test("compactListEntity keeps optional color", () => {
    const list: List = {
      listId: 2,
      name: "L",
      order: 0,
      emoji: null,
    };
    expect(compactListEntity(list)).toEqual({
      type: "list",
      listId: 2,
      name: "L",
      order: 0,
      emoji: null,
    });
  });

  test("compactReleaseEntity maps release fields", () => {
    const r: ReleaseDefinition = {
      releaseId: 9,
      name: "v1",
      color: "#fff",
      releaseDate: "2026-04-01",
      createdAt: "c",
    };
    expect(compactReleaseEntity(r)).toEqual({
      type: "release",
      releaseId: 9,
      name: "v1",
      color: "#fff",
      releaseDate: "2026-04-01",
      createdAt: "c",
    });
  });

  test("compactTaskEntity maps color and closedAt nullables", () => {
    const task = {
      taskId: 3,
      listId: 1,
      groupId: 1,
      priorityId: 5,
      status: "open",
      title: "T",
      body: "",
      order: 0,
      createdAt: "c",
      updatedAt: "u",
      color: undefined,
      emoji: undefined,
      closedAt: undefined,
    } as Task;
    expect(compactTaskEntity(task)).toMatchObject({
      type: "task",
      taskId: 3,
      color: null,
      closedAt: null,
    });
  });
});

describe("writeSuccess / trashedEntity / writeTrashMove", () => {
  test("writeSuccess envelope", () => {
    const envelope = writeSuccess(
      { boardId: 9, slug: "s", updatedAt: "u" },
      {
        type: "board",
        boardId: 9,
        slug: "s",
        name: "N",
        emoji: null,
        createdAt: "c",
        updatedAt: "u",
      },
    );
    expect(envelope).toEqual({
      ok: true,
      boardId: 9,
      boardSlug: "s",
      boardUpdatedAt: "u",
      entity: {
        type: "board",
        boardId: 9,
        slug: "s",
        name: "N",
        emoji: null,
        createdAt: "c",
        updatedAt: "u",
      },
    });
  });

  test("writeReleaseDelete", () => {
    expect(
      writeReleaseDelete(
        { boardId: 2, slug: "brd", updatedAt: "u" },
        88,
      ),
    ).toEqual({
      ok: true,
      boardId: 2,
      boardSlug: "brd",
      boardUpdatedAt: "u",
      entity: { type: "release", releaseId: 88, deleted: true },
    });
  });

  test("trashedEntity and writeTrashMove", () => {
    const t = trashedEntity("task", 4);
    expect(t).toEqual({ type: "task", taskId: 4, trashed: true });
    expect(
      writeTrashMove({ boardId: 1, slug: "b", updatedAt: "x" }, t),
    ).toEqual({
      ok: true,
      boardId: 1,
      boardSlug: "b",
      boardUpdatedAt: "x",
      trashed: t,
    });
  });
});
