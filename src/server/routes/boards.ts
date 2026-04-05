import { Hono, type Context } from "hono";
import { parseBoardCliAccess } from "../../shared/boardCliAccess";
import { parseEmojiField } from "../../shared/emojiField";
import {
  isValidYmd,
  taskMatchesBoardFilter,
  visibleStatusesForBoard,
  type TaskDateFilterResolved,
} from "../../shared/boardFilters";
import {
  TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1,
  TASK_MANAGER_MUTATION_RESPONSE_HEADER,
  type ListDeleteMutationResult,
  type ListMutationResult,
  type TaskDeleteMutationResult,
  type TaskMutationResult,
} from "../../shared/mutationResults";
import type {
  Board,
  GroupDefinition,
  TaskPriorityDefinition,
} from "../../shared/models";
import { ALL_TASK_GROUPS } from "../../shared/models";
import {
  closedStatusIdsFromStatuses,
  computeBoardStats,
  parseBoardStatsFilter,
} from "../../shared/boardStats";
import {
  createBoardWithDefaults,
  createListOnBoard,
  moveListOnBoard,
  createTaskOnBoard,
  deleteBoardById,
  deleteListOnBoard,
  deleteTaskOnBoard,
  entryByIdOrSlug,
  generateSlug,
  listStatuses,
  loadBoard,
  patchBoard,
  patchBoardTaskPriorities,
  patchBoardTaskGroups,
  patchBoardViewPrefs,
  patchListOnBoard,
  moveTaskOnBoard,
  patchTaskOnBoard,
  readListById,
  readBoardIndex,
  readTaskById,
  reorderListsOnBoard,
  reorderTasksInBand,
} from "../storage";
import { cliBoardAccessError } from "../cliBoardGuard";
import { publishBoardChanged, publishBoardEvent } from "../events";
import {
  recordBoardCreated,
  recordBoardDeleted,
  recordBoardPatched,
  recordBoardTaskGroups,
  recordBoardTaskPriorities,
  recordListCreated,
  recordListDeleted,
  recordListMoved,
  recordListUpdated,
  recordListsReordered,
  recordTaskCreated,
  recordTaskDeleted,
  recordTaskMoved,
  recordTaskUpdated,
  recordTasksReordered,
} from "../notifications/record";

export const boardsRoute = new Hono();

function loadBoardAfterGranularWrite(boardId: number): Board | null {
  // Phase 2 keeps the public route payload stable while storage stops depending on
  // full-board reloads for small writes.
  return loadBoard(boardId);
}

function wantsGranularMutationResponse(c: Context): boolean {
  return (
    c.req.header(TASK_MANAGER_MUTATION_RESPONSE_HEADER)?.toLowerCase() ===
    TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1
  );
}

function taskMutationResponse(
  c: Context,
  result: TaskMutationResult,
  status: 200 | 201,
) {
  if (wantsGranularMutationResponse(c)) {
    // The header gate lets Phase 3 ship without breaking older browser and CLI clients.
    return c.json(result, status);
  }
  const saved = loadBoardAfterGranularWrite(result.boardId);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved, status);
}

function taskDeleteResponse(c: Context, result: TaskDeleteMutationResult) {
  if (wantsGranularMutationResponse(c)) {
    return c.json(result);
  }
  const saved = loadBoardAfterGranularWrite(result.boardId);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved);
}

function listMutationResponse(
  c: Context,
  result: ListMutationResult,
  status: 200 | 201,
) {
  if (wantsGranularMutationResponse(c)) {
    return c.json(result, status);
  }
  const saved = loadBoardAfterGranularWrite(result.boardId);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved, status);
}

function listDeleteResponse(c: Context, result: ListDeleteMutationResult) {
  if (wantsGranularMutationResponse(c)) {
    return c.json(result);
  }
  const saved = loadBoardAfterGranularWrite(result.boardId);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved);
}

function repeatedQueryValues(searchParams: URLSearchParams, key: string): string[] {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

boardsRoute.get("/", async (c) => {
  const index = await readBoardIndex();
  return c.json(index);
});

boardsRoute.post("/", async (c) => {
  let body: { name?: string; emoji?: unknown; description?: unknown } = {};
  try {
    const text = await c.req.text();
    if (text)
      body = JSON.parse(text) as {
        name?: string;
        emoji?: unknown;
        description?: unknown;
      };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "New board";
  let emoji: string | null = null;
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
  let description = "";
  if ("description" in body && body.description != null) {
    if (typeof body.description !== "string") {
      return c.json({ error: "Invalid description" }, 400);
    }
    description = body.description.trim();
  }
  const slug = await generateSlug(name);
  const board = await createBoardWithDefaults(name, slug, emoji, description);
  publishBoardChanged(board.id, board.updatedAt);
  recordBoardCreated(c, board);
  return c.json(board, 201);
});

boardsRoute.patch("/:id/view-prefs", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
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
  // Prefer `showStats`; accept legacy `showCounts` for older clients.
  if (typeof body.showStats === "boolean") {
    patch.showStats = body.showStats;
  } else if (typeof (body as { showCounts?: unknown }).showCounts === "boolean") {
    patch.showStats = (body as { showCounts: boolean }).showCounts;
  }
  if (typeof body.muteCelebrationSounds === "boolean") {
    patch.muteCelebrationSounds = body.muteCelebrationSounds;
  }
  const saved = patchBoardViewPrefs(entry.id, patch);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  publishBoardChanged(entry.id, saved.updatedAt);
  // View preference updates do not emit notification rows (Phase 4).
  return c.json(saved);
});

boardsRoute.patch("/:id/groups", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
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

    let emoji: string | null | undefined = undefined;
    if ("emoji" in rec) {
      const raw = rec.emoji;
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

    taskGroups.push({ id, label, emoji });
  }
  if (taskGroups.length === 0) {
    return c.json({ error: "At least one task group required" }, 400);
  }
  try {
    const saved = patchBoardTaskGroups(entry.id, taskGroups);
    if (!saved) return c.json({ error: "Board not found" }, 404);
    publishBoardChanged(entry.id, saved.updatedAt);
    recordBoardTaskGroups(c, entry, saved);
    return c.json(saved);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid task groups";
    return c.json({ error: msg }, 400);
  }
});

boardsRoute.patch("/:id/priorities", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
  let body: { taskPriorities?: unknown };
  try {
    body = (await c.req.json()) as { taskPriorities?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.taskPriorities)) {
    return c.json({ error: "taskPriorities array required" }, 400);
  }
  const taskPriorities: TaskPriorityDefinition[] = [];
  for (const item of body.taskPriorities) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    const color = typeof rec.color === "string" ? rec.color.trim() : "";
    const value =
      typeof rec.value === "number" && Number.isFinite(rec.value)
        ? rec.value
        : Number.NaN;
    const id =
      typeof rec.id === "number" && Number.isFinite(rec.id) ? rec.id : 0;
    const isSystem = Boolean(rec.isSystem);
    taskPriorities.push({ id, value, label, color, isSystem });
  }
  if (taskPriorities.length === 0) {
    return c.json({ error: "At least one task priority required" }, 400);
  }
  try {
    const saved = patchBoardTaskPriorities(entry.id, taskPriorities);
    if (!saved) return c.json({ error: "Board not found" }, 404);
    publishBoardChanged(entry.id, saved.updatedAt);
    recordBoardTaskPriorities(c, entry, saved);
    return c.json(saved);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid task priorities";
    return c.json({ error: msg }, 400);
  }
});

boardsRoute.post("/:id/lists", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
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

  const result = createListOnBoard(entry.id, { name, emoji });
  if (!result) return c.json({ error: "Board not found" }, 404);
  publishBoardEvent({
    kind: "list-created",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    listId: result.list.id,
  });
  {
    const board = loadBoard(entry.id);
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

boardsRoute.put("/:id/lists/move", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
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
  if (!readListById(entry.id, listId)) {
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

  const boardBefore = loadBoard(entry.id);
  if (!boardBefore) return c.json({ error: "Board not found" }, 404);
  const orderBefore = [...boardBefore.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.id);

  const saved = moveListOnBoard(entry.id, {
    listId,
    beforeListId,
    afterListId,
    position,
  });
  if (!saved) return c.json({ error: "Invalid move" }, 400);
  publishBoardChanged(entry.id, saved.updatedAt);
  const orderAfter = [...saved.lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.id);
  // Skip notification when the list order is unchanged (no-op move / same slot).
  if (JSON.stringify(orderBefore) !== JSON.stringify(orderAfter)) {
    recordListMoved(c, entry, saved, listId);
  }
  return c.json(saved);
});

boardsRoute.get("/:id/lists/:listId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "read");
  if (blocked) return blocked;
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const list = readListById(entry.id, listId);
  if (!list) return c.json({ error: "List not found" }, 404);
  return c.json(list);
});

boardsRoute.patch("/:id/lists/:listId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
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
  const result = patchListOnBoard(entry.id, listId, updates);
  if (!result) return c.json({ error: "List not found" }, 404);
  publishBoardEvent({
    kind: "list-updated",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    listId: result.list.id,
  });
  {
    const board = loadBoard(entry.id);
    if (board) recordListUpdated(c, entry, board, result);
  }
  return listMutationResponse(c, {
    boardId: result.boardId,
    boardSlug: entry.slug,
    boardUpdatedAt: result.boardUpdatedAt,
    entity: result.list,
  }, 200);
});

boardsRoute.delete("/:id/lists/:listId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const listSnapshot = readListById(entry.id, listId);
  const result = deleteListOnBoard(entry.id, listId);
  if (!result) return c.json({ error: "List not found" }, 404);
  publishBoardEvent({
    kind: "list-deleted",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    listId: result.deletedListId,
  });
  {
    const board = loadBoard(entry.id);
    if (board && listSnapshot) recordListDeleted(c, entry, board, listSnapshot, result);
  }
  return listDeleteResponse(c, {
    boardId: result.boardId,
    boardSlug: entry.slug,
    boardUpdatedAt: result.boardUpdatedAt,
    deletedListId: result.deletedListId,
  });
});

boardsRoute.put("/:id/lists/order", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
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
  const saved = reorderListsOnBoard(entry.id, orderedListIds);
  if (!saved) return c.json({ error: "Invalid reorder" }, 400);
  publishBoardChanged(entry.id, saved.updatedAt);
  recordListsReordered(c, entry, saved);
  return c.json(saved);
});

boardsRoute.post("/:id/tasks", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
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
  const priorityId =
    body.priorityId === null
      ? null
      : body.priorityId === undefined
        ? undefined
        : Number(body.priorityId);

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

  const result = createTaskOnBoard(entry.id, {
    listId,
    groupId,
    priorityId,
    title,
    body: taskBody,
    status,
    emoji,
  });
  if (!result) return c.json({ error: "Invalid task or board" }, 400);
  publishBoardEvent({
    kind: "task-created",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    taskId: result.task.id,
  });
  {
    const board = loadBoard(entry.id);
    if (board) recordTaskCreated(c, entry, board, result);
  }
  return taskMutationResponse(
    c,
    {
      boardId: result.boardId,
      boardSlug: entry.slug,
      boardUpdatedAt: result.boardUpdatedAt,
      entity: result.task,
    },
    201,
  );
});

boardsRoute.get("/:id/tasks", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "read");
  if (blocked) return blocked;

  const board = loadBoard(entry.id);
  if (!board) return c.json({ error: "Board not found" }, 404);

  const searchParams = new URL(c.req.url).searchParams;
  const listIdRaw = searchParams.get("listId");
  const groupIdRaw = searchParams.get("groupId");
  const priorityIdRaw = repeatedQueryValues(searchParams, "priorityId");
  const statusRaw = repeatedQueryValues(searchParams, "status");
  const dateModeRaw = searchParams.get("dateMode");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const listId =
    listIdRaw == null || listIdRaw === "" ? undefined : Number(listIdRaw);
  if (listId !== undefined && !Number.isFinite(listId)) {
    return c.json({ error: "Invalid listId" }, 400);
  }
  const groupId =
    groupIdRaw == null || groupIdRaw === "" ? undefined : Number(groupIdRaw);
  if (groupId !== undefined && !Number.isFinite(groupId)) {
    return c.json({ error: "Invalid groupId" }, 400);
  }
  const priorityIds = priorityIdRaw.map((value) => Number(value));
  if (!priorityIds.every((value) => Number.isFinite(value))) {
    return c.json({ error: "Invalid priorityId" }, 400);
  }

  const workflowOrder = listStatuses().map((status) => status.id);
  const allowedStatuses = new Set(workflowOrder);
  if (statusRaw.some((status) => !allowedStatuses.has(status))) {
    return c.json({ error: "Invalid status" }, 400);
  }

  let dateFilter: TaskDateFilterResolved | null = null;
  if (dateModeRaw != null || from != null || to != null) {
    if (
      (dateModeRaw !== "opened" && dateModeRaw !== "closed" && dateModeRaw !== "any") ||
      !from ||
      !to ||
      !isValidYmd(from) ||
      !isValidYmd(to)
    ) {
      return c.json({ error: "Invalid date filter" }, 400);
    }
    dateFilter = {
      mode: dateModeRaw,
      startDate: from,
      endDate: to,
    };
  }

  const visibleStatuses =
    statusRaw.length > 0 ? statusRaw : visibleStatusesForBoard(board, workflowOrder);
  const visibleSet = new Set(visibleStatuses);
  const orderByList = new Map(board.lists.map((list) => [list.id, list.order] as const));
  const statusOrder = new Map(workflowOrder.map((status, index) => [status, index] as const));
  const activePriorityIds =
    priorityIds.length > 0 ? priorityIds.map((id) => String(id)) : null;
  const activeGroup =
    groupId !== undefined ? String(groupId) : ALL_TASK_GROUPS;

  const tasks = board.tasks
    .filter((task) => (listId === undefined ? true : task.listId === listId))
    .filter((task) => visibleSet.has(task.status))
    .filter((task) =>
      taskMatchesBoardFilter(task, {
        activeGroup,
        activePriorityIds,
        dateFilter,
      }),
    )
    .sort((a, b) => {
      const listDelta = (orderByList.get(a.listId) ?? 0) - (orderByList.get(b.listId) ?? 0);
      if (listDelta !== 0) return listDelta;
      const statusDelta =
        (statusOrder.get(a.status) ?? 0) - (statusOrder.get(b.status) ?? 0);
      if (statusDelta !== 0) return statusDelta;
      return a.order - b.order || a.id - b.id;
    });

  return c.json(tasks);
});

boardsRoute.put("/:id/tasks/move", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;

  let body: {
    taskId?: unknown;
    toListId?: unknown;
    toStatus?: unknown;
    beforeTaskId?: unknown;
    afterTaskId?: unknown;
    position?: unknown;
    visibleOrderedTaskIds?: unknown;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const taskId = Number(body.taskId);
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "taskId required" }, 400);
  }
  if (!readTaskById(entry.id, taskId)) {
    return c.json({ error: "Task not found" }, 404);
  }

  const toListId =
    body.toListId === undefined ? undefined : Number(body.toListId);
  if (toListId !== undefined && !Number.isFinite(toListId)) {
    return c.json({ error: "Invalid toListId" }, 400);
  }

  const beforeTaskId =
    body.beforeTaskId === undefined ? undefined : Number(body.beforeTaskId);
  const afterTaskId =
    body.afterTaskId === undefined ? undefined : Number(body.afterTaskId);
  if (
    (beforeTaskId !== undefined && !Number.isFinite(beforeTaskId)) ||
    (afterTaskId !== undefined && !Number.isFinite(afterTaskId))
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

  const visibleOrderedTaskIds = Array.isArray(body.visibleOrderedTaskIds)
    ? body.visibleOrderedTaskIds.map((value) => Number(value))
    : undefined;
  if (
    visibleOrderedTaskIds &&
    !visibleOrderedTaskIds.every((value) => Number.isFinite(value))
  ) {
    return c.json({ error: "Invalid visibleOrderedTaskIds" }, 400);
  }

  const taskBeforeMove = readTaskById(entry.id, taskId);

  const saved = moveTaskOnBoard(entry.id, {
    taskId,
    toListId,
    toStatus: typeof body.toStatus === "string" ? body.toStatus : undefined,
    beforeTaskId,
    afterTaskId,
    position,
    visibleOrderedTaskIds,
  });
  if (!saved) return c.json({ error: "Invalid move" }, 400);
  publishBoardChanged(entry.id, saved.updatedAt);
  const taskAfterMove = saved.tasks.find((t) => t.id === taskId);
  if (
    taskBeforeMove &&
    taskAfterMove &&
    (taskBeforeMove.listId !== taskAfterMove.listId ||
      taskBeforeMove.status !== taskAfterMove.status)
  ) {
    recordTaskMoved(c, entry, saved, taskId);
  }
  return c.json(saved);
});

boardsRoute.get("/:id/tasks/:taskId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "read");
  if (blocked) return blocked;
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const task = readTaskById(entry.id, taskId);
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json(task);
});

boardsRoute.patch("/:id/tasks/:taskId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
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
  if (body.priorityId !== undefined) {
    patch.priorityId =
      body.priorityId === null ? null : Number(body.priorityId);
  }
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.order === "number") patch.order = body.order;
  if (typeof body.color === "string" || body.color === null) {
    patch.color = body.color as string | null;
  }
  if ("emoji" in body) {
    const raw = body.emoji;
    if (raw === null || raw === "") {
      patch.emoji = null;
    } else if (typeof raw === "string") {
      const parsed = parseEmojiField(raw);
      if (!parsed.ok) {
        return c.json({ error: parsed.error }, 400);
      }
      patch.emoji = parsed.value;
    } else {
      return c.json({ error: "Invalid emoji" }, 400);
    }
  }
  const taskBeforePatch = readTaskById(entry.id, taskId);
  const result = patchTaskOnBoard(entry.id, taskId, patch);
  if (!result) return c.json({ error: "Task not found" }, 404);
  publishBoardEvent({
    kind: "task-updated",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    taskId: result.task.id,
  });
  {
    const board = loadBoard(entry.id);
    if (board && taskBeforePatch) {
      recordTaskUpdated(c, entry, board, taskBeforePatch, result);
    }
  }
  return taskMutationResponse(c, {
    boardId: result.boardId,
    boardSlug: entry.slug,
    boardUpdatedAt: result.boardUpdatedAt,
    entity: result.task,
  }, 200);
});

boardsRoute.delete("/:id/tasks/:taskId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const taskSnapshot = readTaskById(entry.id, taskId);
  const result = deleteTaskOnBoard(entry.id, taskId);
  if (!result) return c.json({ error: "Task not found" }, 404);
  publishBoardEvent({
    kind: "task-deleted",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    taskId: result.deletedTaskId,
  });
  {
    const board = loadBoard(entry.id);
    if (board && taskSnapshot) recordTaskDeleted(c, entry, board, taskSnapshot, result);
  }
  return taskDeleteResponse(c, {
    boardId: result.boardId,
    boardSlug: entry.slug,
    boardUpdatedAt: result.boardUpdatedAt,
    deletedTaskId: result.deletedTaskId,
  });
});

boardsRoute.put("/:id/tasks/reorder", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
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
  publishBoardChanged(entry.id, saved.updatedAt);
  recordTasksReordered(c, entry, saved, listId, status);
  return c.json(saved);
});

boardsRoute.patch("/:id", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (
    !("name" in body) &&
    !("emoji" in body) &&
    !("cliAccess" in body) &&
    !("description" in body) &&
    !("boardColor" in body)
  ) {
    return c.json(
      {
        error:
          "At least one of name, emoji, cliAccess, description, or boardColor is required",
      },
      400,
    );
  }
  const patch: {
    name?: string;
    emoji?: string | null;
    cliAccess?: Board["cliAccess"];
    description?: string | null;
    boardColor?: Board["boardColor"];
  } = {};
  if ("name" in body) {
    if (typeof body.name !== "string") {
      return c.json({ error: "name must be a string" }, 400);
    }
    const trimmed = body.name.trim();
    if (!trimmed) {
      return c.json({ error: "name required when provided" }, 400);
    }
    patch.name = trimmed;
  }
  if ("emoji" in body) {
    const raw = body.emoji;
    if (raw === null || raw === "") {
      patch.emoji = null;
    } else if (typeof raw === "string") {
      const parsed = parseEmojiField(raw);
      if (!parsed.ok) {
        return c.json({ error: parsed.error }, 400);
      }
      patch.emoji = parsed.value;
    } else {
      return c.json({ error: "Invalid emoji" }, 400);
    }
  }
  if ("cliAccess" in body) {
    const parsed = parseBoardCliAccess(body.cliAccess);
    if (!parsed) {
      return c.json({ error: "Invalid cliAccess" }, 400);
    }
    patch.cliAccess = parsed;
  }
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return c.json({ error: "description must be a string or null" }, 400);
    }
    patch.description =
      body.description === null ? "" : String(body.description);
  }
  if ("boardColor" in body) {
    if (typeof body.boardColor === "string" || body.boardColor === null) {
      patch.boardColor = body.boardColor as Board["boardColor"];
    } else {
      return c.json({ error: "Invalid boardColor" }, 400);
    }
  }
  const saved = await patchBoard(entry.id, patch);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  publishBoardChanged(entry.id, saved.updatedAt);
  recordBoardPatched(c, entry, saved);
  return c.json(saved);
});

// Registered before `GET /:id` so `:id` does not capture the literal `stats`.
boardsRoute.get("/:id/stats", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "read");
  if (blocked) return blocked;
  const board = loadBoard(entry.id);
  if (!board) return c.json({ error: "Board not found" }, 404);
  const statuses = listStatuses();
  const filter = parseBoardStatsFilter(new URL(c.req.url).searchParams);
  const closedIds = closedStatusIdsFromStatuses(statuses);
  const stats = computeBoardStats(board, closedIds, filter);
  return c.json(stats);
});

boardsRoute.get("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "read");
  if (blocked) return blocked;
  const board = loadBoard(entry.id);
  if (!board) return c.json({ error: "Board not found" }, 404);
  return c.json(board);
});

boardsRoute.delete("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardAccessError(c, entry, "write");
  if (blocked) return blocked;
  const snapshot = loadBoard(entry.id);
  if (!snapshot) return c.json({ error: "Board not found" }, 404);
  await deleteBoardById(entry.id);
  publishBoardChanged(entry.id, new Date().toISOString());
  if (snapshot) recordBoardDeleted(c, entry, snapshot);
  return c.body(null, 204);
});
