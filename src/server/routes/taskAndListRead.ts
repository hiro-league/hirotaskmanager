import { Hono } from "hono";
import type { AppBindings } from "../auth";
import { cliBoardReadError } from "../cliPolicyGuard";
import {
  boardIndexEntryById,
  readLiveListWithBoard,
  readLiveTaskWithBoard,
} from "../storage";

/** `GET /api/tasks/:taskId` — board is resolved from the task row; CLI policy uses that board. */
export const taskReadRoute = new Hono<AppBindings>();

taskReadRoute.get("/:taskId", async (c) => {
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const hit = readLiveTaskWithBoard(taskId);
  if (!hit) return c.json({ error: "Task not found" }, 404);
  const entry = await boardIndexEntryById(hit.boardId);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  return c.json(hit.task);
});

/** `GET /api/lists/:listId` — board is resolved from the list row; CLI policy uses that board. */
export const listReadRoute = new Hono<AppBindings>();

listReadRoute.get("/:listId", async (c) => {
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const hit = readLiveListWithBoard(listId);
  if (!hit) return c.json({ error: "List not found" }, 404);
  const entry = await boardIndexEntryById(hit.boardId);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  return c.json(hit.list);
});
