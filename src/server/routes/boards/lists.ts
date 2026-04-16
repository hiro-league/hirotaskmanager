import { Hono } from "hono";
import { parseEmojiField } from "../../../shared/emojiField";
import { paginateInMemory } from "../../../shared/pagination";
import type { AppBindings } from "../../auth";
import {
  cliCreateListsError,
  cliManageAnyListsError,
  cliManageListError,
} from "../../cliPolicyGuard";
import { publishBoardChanged, publishBoardEvent } from "../../events";
import { parseListPagination } from "../../lib/listPagination";
import {
  recordListCreated,
  recordListMoved,
  recordListsReordered,
  recordListTrashed,
  recordListUpdated,
} from "../../notifications/recordList";
import { provenanceForWrite } from "../../provenance";
import {
  createListOnBoard,
  deleteListOnBoard,
  loadBoard,
  moveListOnBoard,
  patchListOnBoard,
  readListById,
  reorderListsOnBoard,
} from "../../storage";
import {
  listDeleteResponse,
  listMutationResponse,
  requireBoardEntry,
} from "./shared";

export const boardListsRoute = new Hono<AppBindings>();

boardListsRoute.post("/:id/lists", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliCreateListsError(c, entry.boardId);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    const text = await c.req.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const name = typeof body.name === "string" ? body.name : "New list";

  let emoji: string | null | undefined = undefined;
  if ("emoji" in body) {
    const raw = body.emoji;
    if (raw === null || raw === "") {
      emoji = null;
    } else if (typeof raw === "string") {
      const parsed = parseEmojiField(raw);
      if (!parsed.ok) {
        return c.json({ error: parsed.error }, 400);
      }
      emoji = parsed.value;
    } else {
      return c.json({ error: "Invalid emoji" }, 400);
    }
  }

  const result = createListOnBoard(entry.boardId, { name, emoji }, provenanceForWrite(c));
  if (!result) return c.json({ error: "Board not found" }, 404);
  publishBoardEvent({
    kind: "list-created",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    listId: result.list.listId,
  });
  {
    const board = loadBoard(entry.boardId);
    if (board) recordListCreated(c, entry, board, result);
  }
  return listMutationResponse(
    c,
    {
      boardId: result.boardId,
      boardSlug: entry.slug,
      boardUpdatedAt: result.boardUpdatedAt,
      entity: result.list,
    },
    201,
  );
});

boardListsRoute.put("/:id/lists/move", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliManageAnyListsError(c, entry.boardId);
  if (blocked) return blocked;

  let body: {
    listId?: unknown;
    beforeListId?: unknown;
    afterListId?: unknown;
    position?: unknown;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const listId = Number(body.listId);
  if (!Number.isFinite(listId)) {
    return c.json({ error: "listId required" }, 400);
  }
  if (!readListById(entry.boardId, listId)) {
    return c.json({ error: "List not found" }, 404);
  }

  const beforeListId =
    body.beforeListId === undefined ? undefined : Number(body.beforeListId);
  const afterListId =
    body.afterListId === undefined ? undefined : Number(body.afterListId);
  if (
    (beforeListId !== undefined && !Number.isFinite(beforeListId)) ||
    (afterListId !== undefined && !Number.isFinite(afterListId))
  ) {
    return c.json({ error: "Invalid move target" }, 400);
  }
  const position =
    body.position === "first" || body.position === "last"
      ? body.position
      : body.position === undefined
        ? undefined
        : null;
  if (position === null) {
    return c.json({ error: "Invalid position" }, 400);
  }

  const boardBefore = loadBoard(entry.boardId);
  if (!boardBefore) return c.json({ error: "Board not found" }, 404);
  const orderBefore = [...boardBefore.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.listId);

  const saved = moveListOnBoard(entry.boardId, {
    listId,
    beforeListId,
    afterListId,
    position,
  });
  if (!saved) return c.json({ error: "Invalid move" }, 400);
  publishBoardChanged(entry.boardId, saved.updatedAt);
  const orderAfter = [...saved.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.listId);
  // Skip notification when the list order is unchanged (no-op move / same slot).
  if (JSON.stringify(orderBefore) !== JSON.stringify(orderAfter)) {
    recordListMoved(c, entry, saved, listId);
  }
  return c.json(saved);
});

// List collection read for CLI/agents: same readBoard gate as GET /boards/:id; ordered like the board UI.
boardListsRoute.get("/:id/lists", async (c) => {
  const entry = requireBoardEntry(c);
  const board = loadBoard(entry.boardId);
  if (!board) return c.json({ error: "Board not found" }, 404);
  const page = parseListPagination(new URL(c.req.url).searchParams, {
    defaultLimit: null,
  });
  if (!page.ok) {
    return c.json({ error: page.error }, 400);
  }
  const ordered = [...board.lists].sort(
    (a, b) => a.order - b.order || a.listId - b.listId,
  );
  return c.json(paginateInMemory(ordered, page.offset, page.limit));
});

boardListsRoute.get("/:id/lists/:listId", async (c) => {
  const entry = requireBoardEntry(c);
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const list = readListById(entry.boardId, listId);
  if (!list) return c.json({ error: "List not found" }, 404);
  return c.json(list);
});

boardListsRoute.patch("/:id/lists/:listId", async (c) => {
  const entry = requireBoardEntry(c);
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const listBefore = readListById(entry.boardId, listId);
  if (!listBefore) return c.json({ error: "List not found" }, 404);
  const blockedList = cliManageListError(c, entry.boardId, listBefore);
  if (blockedList) return blockedList;
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const updates: {
    name?: string;
    color?: string | null;
    emoji?: string | null;
  } = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.color === "string" || body.color === null) {
    updates.color = body.color as string | null;
  }
  if ("emoji" in body) {
    const raw = body.emoji;
    if (raw === null || raw === "") {
      updates.emoji = null;
    } else if (typeof raw === "string") {
      const parsed = parseEmojiField(raw);
      if (!parsed.ok) {
        return c.json({ error: parsed.error }, 400);
      }
      updates.emoji = parsed.value;
    } else {
      return c.json({ error: "Invalid emoji" }, 400);
    }
  }
  const result = patchListOnBoard(entry.boardId, listId, updates);
  if (!result) return c.json({ error: "List not found" }, 404);
  publishBoardEvent({
    kind: "list-updated",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    listId: result.list.listId,
  });
  {
    const board = loadBoard(entry.boardId);
    if (board) recordListUpdated(c, entry, board, result);
  }
  return listMutationResponse(
    c,
    {
      boardId: result.boardId,
      boardSlug: entry.slug,
      boardUpdatedAt: result.boardUpdatedAt,
      entity: result.list,
    },
    200,
  );
});

boardListsRoute.delete("/:id/lists/:listId", async (c) => {
  const entry = requireBoardEntry(c);
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const listSnapshot = readListById(entry.boardId, listId);
  if (!listSnapshot) return c.json({ error: "List not found" }, 404);
  const blockedList = cliManageListError(c, entry.boardId, listSnapshot);
  if (blockedList) return blockedList;
  const result = deleteListOnBoard(entry.boardId, listId);
  if (!result) return c.json({ error: "List not found" }, 404);
  publishBoardEvent({
    kind: "list-trashed",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    listId: result.deletedListId,
  });
  publishBoardChanged(result.boardId, result.boardUpdatedAt);
  {
    const board = loadBoard(entry.boardId);
    if (board && listSnapshot) recordListTrashed(c, entry, board, listSnapshot, result);
  }
  return listDeleteResponse(c, {
    boardId: result.boardId,
    boardSlug: entry.slug,
    boardUpdatedAt: result.boardUpdatedAt,
    deletedListId: result.deletedListId,
  });
});

boardListsRoute.put("/:id/lists/order", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliManageAnyListsError(c, entry.boardId);
  if (blocked) return blocked;
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
  const saved = reorderListsOnBoard(entry.boardId, orderedListIds);
  if (!saved) return c.json({ error: "Invalid reorder" }, 400);
  publishBoardChanged(entry.boardId, saved.updatedAt);
  recordListsReordered(c, entry, saved);
  return c.json(saved);
});
