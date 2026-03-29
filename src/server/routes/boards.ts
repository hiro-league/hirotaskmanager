import { Hono } from "hono";
import { nanoid } from "nanoid";
import {
  DEFAULT_STATUS_DEFINITIONS,
  DEFAULT_TASK_TYPES,
  type Board,
} from "../../shared/models";
import {
  deleteBoardFile,
  readBoardFile,
  readBoardIndex,
  removeBoardFromIndex,
  syncIndexFromBoard,
  writeBoardAtomic,
} from "../storage";

function newBoardDocument(id: string, name: string, now: string): Board {
  const taskTypes = [...DEFAULT_TASK_TYPES];
  const statusDefinitions = [...DEFAULT_STATUS_DEFINITIONS];
  return {
    id,
    name,
    taskTypes,
    statusDefinitions,
    activeTaskType: taskTypes[0] ?? "task",
    visibleStatuses: [...statusDefinitions],
    showCounts: true,
    lists: [],
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const boardsRoute = new Hono();

boardsRoute.get("/", async (c) => {
  const index = await readBoardIndex();
  return c.json(index);
});

boardsRoute.post("/", async (c) => {
  let body: { name?: string } = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text) as { name?: string };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const now = new Date().toISOString();
  const id = nanoid();
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "New board";
  const board = newBoardDocument(id, name, now);
  await writeBoardAtomic(board);
  await syncIndexFromBoard(board);
  return c.json(board, 201);
});

boardsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const board = await readBoardFile(id);
  if (!board) return c.json({ error: "Board not found" }, 404);
  return c.json(board);
});

boardsRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  let board: Board;
  try {
    board = (await c.req.json()) as Board;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (board.id !== id) {
    return c.json({ error: "Body id must match URL" }, 400);
  }
  const existing = await readBoardFile(id);
  if (!existing) return c.json({ error: "Board not found" }, 404);

  const now = new Date().toISOString();
  const next: Board = {
    ...board,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  await writeBoardAtomic(next);
  await syncIndexFromBoard(next);
  return c.json(next);
});

boardsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await readBoardFile(id);
  if (!existing) return c.json({ error: "Board not found" }, 404);
  await removeBoardFromIndex(id);
  await deleteBoardFile(id);
  return c.body(null, 204);
});
