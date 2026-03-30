import { Hono } from "hono";
import { nanoid } from "nanoid";
import { DEFAULT_BOARD_COLOR } from "../../shared/boardColor";
import {
  createDefaultTaskGroups,
  TASK_STATUSES,
  normalizeBoardFromJson,
  type Board,
} from "../../shared/models";
import {
  deleteBoardFile,
  entryByIdOrSlug,
  generateSlug,
  readBoardFile,
  readBoardIndex,
  renameBoardFile,
  removeBoardFromIndex,
  slugForId,
  syncIndexFromBoard,
  writeBoardAtomic,
} from "../storage";

function newBoardDocument(id: string, name: string, now: string): Board {
  const taskGroups = createDefaultTaskGroups();
  return {
    id,
    name,
    taskGroups,
    visibleStatuses: [...TASK_STATUSES],
    boardLayout: "stacked",
    boardColor: DEFAULT_BOARD_COLOR,
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
  const slug = await generateSlug(name);
  const board = newBoardDocument(id, name, now);
  await writeBoardAtomic(board, slug);
  await syncIndexFromBoard(board, slug);
  return c.json(board, 201);
});

boardsRoute.get("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const board = await readBoardFile(entry.id);
  if (!board) return c.json({ error: "Board not found" }, 404);
  return c.json(board);
});

boardsRoute.put("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const id = entry.id;
  let board: Board;
  try {
    const raw = (await c.req.json()) as Record<string, unknown>;
    board = normalizeBoardFromJson(raw);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (board.id !== id) {
    return c.json({ error: "Body id must match URL" }, 400);
  }
  const existing = await readBoardFile(id);
  if (!existing) return c.json({ error: "Board not found" }, 404);

  const oldSlug = await slugForId(id);
  if (!oldSlug) return c.json({ error: "Board slug not found" }, 500);

  const nameChanged = existing.name !== board.name;
  const newSlug = nameChanged
    ? await generateSlug(board.name, id)
    : oldSlug;

  if (nameChanged) {
    await renameBoardFile(oldSlug, newSlug);
  }

  const now = new Date().toISOString();
  const next: Board = {
    ...board,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  await writeBoardAtomic(next, newSlug);
  await syncIndexFromBoard(next, newSlug);
  return c.json(next);
});

boardsRoute.delete("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const id = entry.id;
  const slug = entry.slug;
  const existing = await readBoardFile(id);
  if (!existing) return c.json({ error: "Board not found" }, 404);
  await removeBoardFromIndex(id);
  await deleteBoardFile(slug);
  return c.body(null, 204);
});
