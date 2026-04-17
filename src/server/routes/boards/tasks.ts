import { Hono } from "hono";
import {
  isValidYmd,
  RELEASE_FILTER_UNTAGGED,
  taskMatchesBoardFilter,
  visibleStatusesForBoard,
  type ActiveReleaseIds,
  type TaskDateFilterResolved,
} from "../../../shared/boardFilters";
import { parseEmojiField } from "../../../shared/emojiField";
import { paginateInMemory } from "../../../shared/pagination";
import { repeatedSearchParamValues } from "../../../shared/repeatedSearchParams";
import type { AppBindings } from "../../auth";
import {
  cliCreateTasksError,
  cliManageAnyTasksError,
  cliManageTaskError,
} from "../../cliPolicyGuard";
import { publishBoardChanged, publishBoardEvent } from "../../events";
import {
  recordTaskCreated,
  recordTaskMoved,
  recordTasksReordered,
  recordTaskTrashed,
  recordTaskUpdated,
} from "../../notifications/recordTask";
import { provenanceForWrite } from "../../provenance";
import {
  createTaskOnBoard,
  listStatuses,
  loadBoard,
  moveTaskOnBoard,
  patchTaskOnBoard,
  readTaskById,
  reorderTasksInBand,
  deleteTaskOnBoard,
} from "../../storage";
import { parseListPagination } from "../../lib/listPagination";
import {
  requireBoardEntry,
  taskDeleteResponse,
  taskMutationResponse,
} from "./shared";

export const boardTasksRoute = new Hono<AppBindings>();

boardTasksRoute.post("/:id/tasks", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliCreateTasksError(c, entry.boardId);
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
  // Tasks always have a `priority_id`; clients omit the field or send a row id (no JSON null).
  if ("priorityId" in body && body.priorityId === null) {
    return c.json({ error: "priorityId must be a number or omitted" }, 400);
  }
  let priorityId: number | undefined;
  if (body.priorityId !== undefined) {
    const n = Number(body.priorityId);
    if (!Number.isFinite(n)) {
      return c.json({ error: "Invalid priorityId" }, 400);
    }
    priorityId = n;
  }

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

  // releaseId: omitted → server may auto-assign from board default + principal; null → force untagged.
  let releaseId: number | null | undefined = undefined;
  if ("releaseId" in body) {
    if (body.releaseId === null) {
      releaseId = null;
    } else {
      const n = Number(body.releaseId);
      if (!Number.isFinite(n)) {
        return c.json({ error: "Invalid releaseId" }, 400);
      }
      releaseId = n;
    }
  }

  const result = createTaskOnBoard(
    entry.boardId,
    {
      listId,
      groupId,
      priorityId,
      title,
      body: taskBody,
      status,
      emoji,
      releaseId,
    },
    provenanceForWrite(c),
  );
  if (!result) return c.json({ error: "Invalid task or board" }, 400);
  publishBoardEvent({
    kind: "task-created",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    taskId: result.task.taskId,
  });
  {
    const board = loadBoard(entry.boardId);
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

boardTasksRoute.get("/:id/tasks", async (c) => {
  const entry = requireBoardEntry(c);
  const board = loadBoard(entry.boardId);
  if (!board) return c.json({ error: "Board not found" }, 404);

  const searchParams = new URL(c.req.url).searchParams;
  const listIdRaw = searchParams.get("listId");
  const groupIdRaw = repeatedSearchParamValues(searchParams, "groupId");
  const priorityIdRaw = repeatedSearchParamValues(searchParams, "priorityId");
  const statusRaw = repeatedSearchParamValues(searchParams, "status");
  const dateModeRaw = searchParams.get("dateMode");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const listId =
    listIdRaw == null || listIdRaw === "" ? undefined : Number(listIdRaw);
  if (listId !== undefined && !Number.isFinite(listId)) {
    return c.json({ error: "Invalid listId" }, 400);
  }
  const groupIds = groupIdRaw.map((value) => Number(value));
  if (!groupIds.every((value) => Number.isFinite(value))) {
    return c.json({ error: "Invalid groupId" }, 400);
  }
  const priorityIds = priorityIdRaw.map((value) => Number(value));
  if (!priorityIds.every((value) => Number.isFinite(value))) {
    return c.json({ error: "Invalid priorityId" }, 400);
  }

  const hasReleaseFilterKey = searchParams.has("releaseId");
  const releaseFilterRaw = repeatedSearchParamValues(searchParams, "releaseId");
  let activeReleaseIds: ActiveReleaseIds;
  if (!hasReleaseFilterKey) {
    activeReleaseIds = null;
  } else if (releaseFilterRaw.length === 0) {
    activeReleaseIds = [];
  } else {
    for (const part of releaseFilterRaw) {
      if (part === RELEASE_FILTER_UNTAGGED) continue;
      const n = Number(part);
      if (!Number.isFinite(n)) {
        return c.json({ error: "Invalid releaseId filter" }, 400);
      }
    }
    activeReleaseIds = releaseFilterRaw;
  }

  const workflowOrder = listStatuses().map((status) => status.statusId);
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
  const orderByList = new Map(board.lists.map((list) => [list.listId, list.order] as const));
  const statusOrder = new Map(workflowOrder.map((status, index) => [status, index] as const));
  const activePriorityIds =
    priorityIds.length > 0 ? priorityIds.map((id) => String(id)) : null;
  // Repeated `groupId` is OR; omitted = all groups (same convention as `priorityId`).
  const activeGroupIds =
    groupIds.length > 0 ? groupIds.map((id) => String(id)) : null;

  const tasks = board.tasks
    .filter((task) => (listId === undefined ? true : task.listId === listId))
    .filter((task) => visibleSet.has(task.status))
    .filter((task) =>
      taskMatchesBoardFilter(task, {
        activeGroupIds,
        activePriorityIds,
        activeReleaseIds,
        dateFilter,
      }),
    )
    .sort((a, b) => {
      const listDelta = (orderByList.get(a.listId) ?? 0) - (orderByList.get(b.listId) ?? 0);
      if (listDelta !== 0) return listDelta;
      const statusDelta =
        (statusOrder.get(a.status) ?? 0) - (statusOrder.get(b.status) ?? 0);
      if (statusDelta !== 0) return statusDelta;
      return a.order - b.order || a.taskId - b.taskId;
    });

  const page = parseListPagination(new URL(c.req.url).searchParams, {
    defaultLimit: null,
  });
  if (!page.ok) {
    return c.json({ error: page.error }, 400);
  }
  const taskRows = tasks.map((task) => ({
    ...task,
    boardId: entry.boardId,
    boardSlug: entry.slug,
  }));
  return c.json(paginateInMemory(taskRows, page.offset, page.limit));
});

boardTasksRoute.put("/:id/tasks/move", async (c) => {
  const entry = requireBoardEntry(c);

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
  const taskForPolicy = readTaskById(entry.boardId, taskId);
  if (!taskForPolicy) {
    return c.json({ error: "Task not found" }, 404);
  }
  const blockedTask = cliManageTaskError(c, entry.boardId, taskForPolicy);
  if (blockedTask) return blockedTask;

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

  const taskBeforeMove = taskForPolicy;

  const saved = moveTaskOnBoard(entry.boardId, {
    taskId,
    toListId,
    toStatus: typeof body.toStatus === "string" ? body.toStatus : undefined,
    beforeTaskId,
    afterTaskId,
    position,
    visibleOrderedTaskIds,
  });
  if (!saved) return c.json({ error: "Invalid move" }, 400);
  publishBoardChanged(entry.boardId, saved.updatedAt);
  const taskAfterMove = saved.tasks.find((t) => t.taskId === taskId);
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

boardTasksRoute.patch("/:id/tasks/:taskId", async (c) => {
  const entry = requireBoardEntry(c);
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const taskForPolicy = readTaskById(entry.boardId, taskId);
  if (!taskForPolicy) return c.json({ error: "Task not found" }, 404);
  const blockedTask = cliManageTaskError(c, entry.boardId, taskForPolicy);
  if (blockedTask) return blockedTask;
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
    if (body.priorityId === null) {
      return c.json({ error: "priorityId must be a number" }, 400);
    }
    const n = Number(body.priorityId);
    if (!Number.isFinite(n)) {
      return c.json({ error: "Invalid priorityId" }, 400);
    }
    patch.priorityId = n;
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
  if ("releaseId" in body) {
    if (body.releaseId === null) {
      patch.releaseId = null;
    } else {
      const n = Number(body.releaseId);
      if (!Number.isFinite(n)) {
        return c.json({ error: "Invalid releaseId" }, 400);
      }
      patch.releaseId = n;
    }
  }
  const taskBeforePatch = taskForPolicy;
  const result = patchTaskOnBoard(entry.boardId, taskId, patch);
  if (!result) return c.json({ error: "Task not found" }, 404);
  publishBoardEvent({
    kind: "task-updated",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    taskId: result.task.taskId,
  });
  {
    const board = loadBoard(entry.boardId);
    if (board && taskBeforePatch) {
      recordTaskUpdated(c, entry, board, taskBeforePatch, result);
    }
  }
  return taskMutationResponse(
    c,
    {
      boardId: result.boardId,
      boardSlug: entry.slug,
      boardUpdatedAt: result.boardUpdatedAt,
      entity: result.task,
    },
    200,
  );
});

boardTasksRoute.delete("/:id/tasks/:taskId", async (c) => {
  const entry = requireBoardEntry(c);
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const taskSnapshot = readTaskById(entry.boardId, taskId);
  if (!taskSnapshot) return c.json({ error: "Task not found" }, 404);
  const blockedTask = cliManageTaskError(c, entry.boardId, taskSnapshot);
  if (blockedTask) return blockedTask;
  const result = deleteTaskOnBoard(entry.boardId, taskId);
  if (!result) return c.json({ error: "Task not found" }, 404);
  publishBoardEvent({
    kind: "task-trashed",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    taskId: result.deletedTaskId,
  });
  publishBoardChanged(result.boardId, result.boardUpdatedAt);
  {
    const board = loadBoard(entry.boardId);
    if (board && taskSnapshot) recordTaskTrashed(c, entry, board, taskSnapshot, result);
  }
  return taskDeleteResponse(c, {
    boardId: result.boardId,
    boardSlug: entry.slug,
    boardUpdatedAt: result.boardUpdatedAt,
    deletedTaskId: result.deletedTaskId,
  });
});

boardTasksRoute.put("/:id/tasks/reorder", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliManageAnyTasksError(c, entry.boardId);
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
  const saved = reorderTasksInBand(entry.boardId, listId, status, orderedTaskIds);
  if (!saved) return c.json({ error: "Invalid reorder" }, 400);
  publishBoardChanged(entry.boardId, saved.updatedAt);
  recordTasksReordered(c, entry, saved, listId, status);
  return c.json(saved);
});
