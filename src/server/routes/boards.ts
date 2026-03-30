import { Hono } from "hono";
import type { Board, GroupDefinition } from "../../shared/models";
import {
  createBoardWithDefaults,
  createListOnBoard,
  createTaskOnBoard,
  deleteBoardById,
  deleteListOnBoard,
  deleteTaskOnBoard,
  entryByIdOrSlug,
  generateSlug,
  loadBoard,
  patchBoardName,
  patchBoardTaskGroups,
  patchBoardViewPrefs,
  patchListOnBoard,
  patchTaskOnBoard,
  readBoardIndex,
  reorderListsOnBoard,
  reorderTasksInBand,
} from "../storage";

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

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "New board";
  const slug = await generateSlug(name);
  const board = await createBoardWithDefaults(name, slug);
  return c.json(board, 201);
});

boardsRoute.patch("/:id/view-prefs", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const patch: Parameters<typeof patchBoardViewPrefs>[1] = {};
  if (Array.isArray(body.visibleStatuses)) {
    patch.visibleStatuses = body.visibleStatuses as string[];
  }
  if (Array.isArray(body.statusBandWeights)) {
    patch.statusBandWeights = body.statusBandWeights as number[];
  }
  if (body.boardLayout === "lanes" || body.boardLayout === "stacked") {
    patch.boardLayout = body.boardLayout;
  }
  if (typeof body.boardColor === "string" || body.boardColor === null) {
    patch.boardColor = body.boardColor as Board["boardColor"];
  }
  if (typeof body.backgroundImage === "string" || body.backgroundImage === null) {
    patch.backgroundImage = body.backgroundImage as string | null;
  }
  if (typeof body.showCounts === "boolean") {
    patch.showCounts = body.showCounts;
  }
  const saved = patchBoardViewPrefs(entry.id, patch);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved);
});

boardsRoute.patch("/:id/groups", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  let body: { taskGroups?: unknown };
  try {
    body = (await c.req.json()) as { taskGroups?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.taskGroups)) {
    return c.json({ error: "taskGroups array required" }, 400);
  }
  const taskGroups: GroupDefinition[] = [];
  for (const item of body.taskGroups) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    if (!label) continue;
    const id =
      typeof rec.id === "number" && Number.isFinite(rec.id) ? rec.id : 0;
    taskGroups.push({ id, label });
  }
  if (taskGroups.length === 0) {
    return c.json({ error: "At least one task group required" }, 400);
  }
  try {
    const saved = patchBoardTaskGroups(entry.id, taskGroups);
    if (!saved) return c.json({ error: "Board not found" }, 404);
    return c.json(saved);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid task groups";
    return c.json({ error: msg }, 400);
  }
});

boardsRoute.post("/:id/lists", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  let body: { name?: string };
  try {
    const text = await c.req.text();
    body = text ? (JSON.parse(text) as { name?: string }) : {};
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const name = typeof body.name === "string" ? body.name : "New list";
  const saved = createListOnBoard(entry.id, name);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved, 201);
});

boardsRoute.patch("/:id/lists/:listId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const updates: { name?: string; color?: string | null } = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.color === "string" || body.color === null) {
    updates.color = body.color as string | null;
  }
  const saved = patchListOnBoard(entry.id, listId, updates);
  if (!saved) return c.json({ error: "List not found" }, 404);
  return c.json(saved);
});

boardsRoute.delete("/:id/lists/:listId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const saved = deleteListOnBoard(entry.id, listId);
  if (!saved) return c.json({ error: "List not found" }, 404);
  return c.json(saved);
});

boardsRoute.put("/:id/lists/order", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  let body: { orderedListIds?: unknown };
  try {
    body = (await c.req.json()) as { orderedListIds?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.orderedListIds)) {
    return c.json({ error: "orderedListIds required" }, 400);
  }
  const orderedListIds = body.orderedListIds.map((x) => Number(x));
  if (!orderedListIds.every((n) => Number.isFinite(n))) {
    return c.json({ error: "Invalid orderedListIds" }, 400);
  }
  const saved = reorderListsOnBoard(entry.id, orderedListIds);
  if (!saved) return c.json({ error: "Invalid reorder" }, 400);
  return c.json(saved);
});

boardsRoute.post("/:id/tasks", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const listId = Number(body.listId);
  const groupId = Number(body.groupId);
  if (!Number.isFinite(listId) || !Number.isFinite(groupId)) {
    return c.json({ error: "listId and groupId required" }, 400);
  }
  const title = typeof body.title === "string" ? body.title : "";
  const taskBody = typeof body.body === "string" ? body.body : "";
  const status = typeof body.status === "string" ? body.status : "open";
  const saved = createTaskOnBoard(entry.id, {
    listId,
    groupId,
    title,
    body: taskBody,
    status,
  });
  if (!saved) return c.json({ error: "Invalid task or board" }, 400);
  return c.json(saved, 201);
});

boardsRoute.patch("/:id/tasks/:taskId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const patch: Parameters<typeof patchTaskOnBoard>[2] = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.body === "string") patch.body = body.body;
  if (body.listId !== undefined) patch.listId = Number(body.listId);
  if (body.groupId !== undefined) patch.groupId = Number(body.groupId);
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.order === "number") patch.order = body.order;
  if (typeof body.color === "string" || body.color === null) {
    patch.color = body.color as string | null;
  }
  const saved = patchTaskOnBoard(entry.id, taskId, patch);
  if (!saved) return c.json({ error: "Task not found" }, 404);
  return c.json(saved);
});

boardsRoute.delete("/:id/tasks/:taskId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const saved = deleteTaskOnBoard(entry.id, taskId);
  if (!saved) return c.json({ error: "Task not found" }, 404);
  return c.json(saved);
});

boardsRoute.put("/:id/tasks/reorder", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  let body: {
    listId?: unknown;
    status?: unknown;
    orderedTaskIds?: unknown;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const listId = Number(body.listId);
  const status = typeof body.status === "string" ? body.status : "";
  if (!Number.isFinite(listId) || !status) {
    return c.json({ error: "listId and status required" }, 400);
  }
  if (!Array.isArray(body.orderedTaskIds)) {
    return c.json({ error: "orderedTaskIds required" }, 400);
  }
  const orderedTaskIds = body.orderedTaskIds.map((x) => Number(x));
  if (!orderedTaskIds.every((n) => Number.isFinite(n))) {
    return c.json({ error: "Invalid orderedTaskIds" }, 400);
  }
  const saved = reorderTasksInBand(entry.id, listId, status, orderedTaskIds);
  if (!saved) return c.json({ error: "Invalid reorder" }, 400);
  return c.json(saved);
});

boardsRoute.patch("/:id", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  let body: { name?: string };
  try {
    body = (await c.req.json()) as { name?: string };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const name = typeof body.name === "string" ? body.name : "";
  if (!name.trim()) return c.json({ error: "name required" }, 400);
  const saved = await patchBoardName(entry.id, name);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved);
});

boardsRoute.get("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const board = loadBoard(entry.id);
  if (!board) return c.json({ error: "Board not found" }, 404);
  return c.json(board);
});

boardsRoute.delete("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  if (!loadBoard(entry.id)) return c.json({ error: "Board not found" }, 404);
  await deleteBoardById(entry.id);
  return c.body(null, 204);
});
