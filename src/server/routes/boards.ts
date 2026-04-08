import { Hono, type Context } from "hono";
import {
  type BoardCliPolicy,
  parseBoardCliPolicy,
} from "../../shared/cliPolicy";
import { parseEmojiField } from "../../shared/emojiField";
import {
  isValidYmd,
  RELEASE_FILTER_UNTAGGED,
  taskMatchesBoardFilter,
  visibleStatusesForBoard,
  type ActiveReleaseIds,
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
import type { Board, TaskPriorityDefinition } from "../../shared/models";
import { parsePatchBoardTaskGroupConfigBody } from "../../shared/taskGroupConfig";
import {
  closedStatusIdsFromStatuses,
  computeBoardStats,
  parseBoardStatsFilter,
} from "../../shared/boardStats";
import {
  BOARD_FETCH_MAX_TASK_BODY_PREVIEW_CHARS,
  BOARD_FETCH_SLIM_TASK_BODY_CHARS,
} from "../../shared/boardPayload";
import { repeatedSearchParamValues } from "../../shared/repeatedSearchParams";
import {
  createBoardWithDefaults,
  createListOnBoard,
  moveListOnBoard,
  createTaskOnBoard,
  trashBoardById,
  deleteListOnBoard,
  deleteTaskOnBoard,
  entryByIdOrSlug,
  generateSlug,
  listStatuses,
  loadBoard,
  patchBoard,
  patchBoardTaskPriorities,
  patchBoardTaskGroupConfig,
  patchBoardViewPrefs,
  patchListOnBoard,
  moveTaskOnBoard,
  patchTaskOnBoard,
  readListById,
  readBoardIndex,
  readTaskById,
  reorderListsOnBoard,
  reorderTasksInBand,
  createBoardRelease,
  updateBoardRelease,
  deleteBoardRelease,
} from "../storage";
import { readBoardCliPolicy } from "../storage/cliPolicy";
import { getRequestAuthContext, type AppBindings } from "../auth";
import {
  cliBoardReadError,
  cliCreateBoardDeniedError,
  cliCreateListsError,
  cliCreateTasksError,
  cliDeleteBoardError,
  cliEditBoardMetadataError,
  cliManageAnyListsError,
  cliManageAnyTasksError,
  cliManageListError,
  cliManageStructureError,
  cliManageTaskError,
} from "../cliPolicyGuard";
import { provenanceForWrite } from "../provenance";
import { publishBoardChanged, publishBoardEvent } from "../events";
import {
  recordBoardCreated,
  recordBoardTrashed,
  recordBoardPatched,
  recordBoardTaskGroups,
  recordBoardTaskPriorities,
  recordListCreated,
  recordListTrashed,
  recordListMoved,
  recordListUpdated,
  recordListsReordered,
  recordTaskCreated,
  recordTaskTrashed,
  recordTaskMoved,
  recordTaskUpdated,
  recordTasksReordered,
} from "../notifications/record";

export const boardsRoute = new Hono<AppBindings>();

function loadBoardAfterGranularWrite(boardId: number): Board | null {
  // Phase 2 keeps the public route payload stable while storage stops depending on
  // full-board reloads for small writes.
  return loadBoard(boardId);
}

function wantsGranularMutationResponse(c: Context<AppBindings>): boolean {
  return (
    c.req.header(TASK_MANAGER_MUTATION_RESPONSE_HEADER)?.toLowerCase() ===
    TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1
  );
}

/** `GET /api/boards/:id` — optional slim task bodies (board perf plan Phase 2 #7). */
function parseBoardFetchBodyPreview(c: Context<AppBindings>): number | undefined {
  const rawPreview = c.req.query("bodyPreview");
  if (rawPreview != null && rawPreview !== "") {
    const n = Number(rawPreview);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.min(BOARD_FETCH_MAX_TASK_BODY_PREVIEW_CHARS, Math.floor(n));
  }
  const slim = c.req.query("slim");
  if (slim === "1" || slim === "true") {
    return BOARD_FETCH_SLIM_TASK_BODY_CHARS;
  }
  return undefined;
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

boardsRoute.get("/", async (c) => {
  const index = await readBoardIndex();
  if (getRequestAuthContext(c).principal === "web") {
    return c.json(index);
  }
  return c.json(
    index.filter((entry) => readBoardCliPolicy(entry.id)?.readBoard),
  );
});

boardsRoute.post("/", async (c) => {
  const auth = getRequestAuthContext(c);
  if (auth.principal === "cli") {
    const blocked = cliCreateBoardDeniedError(c);
    if (blocked) return blocked;
  }
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
  const board = await createBoardWithDefaults(name, slug, emoji, description, {
    createdBy: provenanceForWrite(c),
    cliBootstrap: auth.principal === "web" ? "web_default" : "cli_full",
  });
  publishBoardChanged(board.id, board.updatedAt);
  recordBoardCreated(c, board);
  return c.json(board, 201);
});

boardsRoute.patch("/:id/view-prefs", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliEditBoardMetadataError(c, entry.id);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliManageStructureError(c, entry.id);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parsePatchBoardTaskGroupConfigBody(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }
  try {
    const saved = patchBoardTaskGroupConfig(entry.id, parsed.value);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliManageStructureError(c, entry.id);
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

boardsRoute.get("/:id/releases", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const board = loadBoard(entry.id);
  if (!board) return c.json({ error: "Board not found" }, 404);
  return c.json(board.releases);
});

boardsRoute.post("/:id/releases", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliManageStructureError(c, entry.id);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }
  let color: string | null | undefined;
  if ("color" in body) {
    if (body.color === null || body.color === "") color = null;
    else if (typeof body.color === "string") color = body.color.trim();
    else return c.json({ error: "Invalid color" }, 400);
  }
  let releaseDate: string | null | undefined;
  if ("releaseDate" in body) {
    if (body.releaseDate === null || body.releaseDate === "") releaseDate = null;
    else if (typeof body.releaseDate === "string") releaseDate = body.releaseDate.trim();
    else return c.json({ error: "Invalid releaseDate" }, 400);
  }
  const created = createBoardRelease(entry.id, {
    name,
    color,
    releaseDate,
  });
  if (!created) {
    return c.json(
      { error: "Could not create release (duplicate name?)" },
      400,
    );
  }
  const board = loadBoard(entry.id);
  if (board) {
    // Granular SSE: other tabs merge `releases` without refetching the full board (phase 5 sync).
    publishBoardEvent({
      kind: "release-upserted",
      boardId: entry.id,
      boardUpdatedAt: board.updatedAt,
      release: created,
    });
  }
  return c.json(created, 201);
});

boardsRoute.patch("/:id/releases/:releaseId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliManageStructureError(c, entry.id);
  if (blocked) return blocked;
  const releaseId = Number(c.req.param("releaseId"));
  if (!Number.isFinite(releaseId)) {
    return c.json({ error: "Invalid release id" }, 400);
  }
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const input: {
    name?: string;
    color?: string | null;
    releaseDate?: string | null;
  } = {};
  if (typeof body.name === "string") input.name = body.name;
  if ("color" in body) {
    if (body.color === null || body.color === "") input.color = null;
    else if (typeof body.color === "string") input.color = body.color.trim();
    else return c.json({ error: "Invalid color" }, 400);
  }
  if ("releaseDate" in body) {
    if (body.releaseDate === null || body.releaseDate === "") {
      input.releaseDate = null;
    } else if (typeof body.releaseDate === "string") {
      input.releaseDate = body.releaseDate.trim();
    } else {
      return c.json({ error: "Invalid releaseDate" }, 400);
    }
  }
  if (
    input.name === undefined &&
    !("color" in body) &&
    !("releaseDate" in body)
  ) {
    return c.json({ error: "No changes" }, 400);
  }
  const updated = updateBoardRelease(entry.id, releaseId, input);
  if (!updated) {
    return c.json({ error: "Release not found or duplicate name" }, 400);
  }
  const board = loadBoard(entry.id);
  if (board) {
    publishBoardEvent({
      kind: "release-upserted",
      boardId: entry.id,
      boardUpdatedAt: board.updatedAt,
      release: updated,
    });
  }
  return c.json(updated);
});

boardsRoute.delete("/:id/releases/:releaseId", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliManageStructureError(c, entry.id);
  if (blocked) return blocked;
  const releaseId = Number(c.req.param("releaseId"));
  if (!Number.isFinite(releaseId)) {
    return c.json({ error: "Invalid release id" }, 400);
  }
  const url = new URL(c.req.url);
  const moveRaw = url.searchParams.get("moveTasksTo");
  let options: { moveTasksToReleaseId?: number } = {};
  if (moveRaw != null && moveRaw !== "") {
    const n = Number(moveRaw);
    if (!Number.isFinite(n)) {
      return c.json({ error: "Invalid moveTasksTo" }, 400);
    }
    options = { moveTasksToReleaseId: n };
  }
  const ok = deleteBoardRelease(entry.id, releaseId, options);
  if (!ok) return c.json({ error: "Release not found or invalid move target" }, 400);
  const board = loadBoard(entry.id);
  if (board) publishBoardChanged(entry.id, board.updatedAt);
  return c.body(null, 204);
});

boardsRoute.post("/:id/lists", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliCreateListsError(c, entry.id);
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

  const result = createListOnBoard(entry.id, { name, emoji }, provenanceForWrite(c));
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliManageAnyListsError(c, entry.id);
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
  const blocked = cliBoardReadError(c, entry);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const listBefore = readListById(entry.id, listId);
  if (!listBefore) return c.json({ error: "List not found" }, 404);
  const blockedList = cliManageListError(c, entry.id, listBefore);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const listId = Number(c.req.param("listId"));
  if (!Number.isFinite(listId)) {
    return c.json({ error: "Invalid list id" }, 400);
  }
  const listSnapshot = readListById(entry.id, listId);
  if (!listSnapshot) return c.json({ error: "List not found" }, 404);
  const blockedList = cliManageListError(c, entry.id, listSnapshot);
  if (blockedList) return blockedList;
  const result = deleteListOnBoard(entry.id, listId);
  if (!result) return c.json({ error: "List not found" }, 404);
  publishBoardEvent({
    kind: "list-trashed",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    listId: result.deletedListId,
  });
  publishBoardChanged(result.boardId, result.boardUpdatedAt);
  {
    const board = loadBoard(entry.id);
    if (board && listSnapshot) recordListTrashed(c, entry, board, listSnapshot, result);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliManageAnyListsError(c, entry.id);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliCreateTasksError(c, entry.id);
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
    entry.id,
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
  const blocked = cliBoardReadError(c, entry);
  if (blocked) return blocked;

  const board = loadBoard(entry.id);
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
      return a.order - b.order || a.id - b.id;
    });

  return c.json(tasks);
});

boardsRoute.put("/:id/tasks/move", async (c) => {
  const entry = await entryByIdOrSlug(c.req.param("id"));
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;

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
  const taskForPolicy = readTaskById(entry.id, taskId);
  if (!taskForPolicy) {
    return c.json({ error: "Task not found" }, 404);
  }
  const blockedTask = cliManageTaskError(c, entry.id, taskForPolicy);
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
  const blocked = cliBoardReadError(c, entry);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const taskForPolicy = readTaskById(entry.id, taskId);
  if (!taskForPolicy) return c.json({ error: "Task not found" }, 404);
  const blockedTask = cliManageTaskError(c, entry.id, taskForPolicy);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) {
    return c.json({ error: "Invalid task id" }, 400);
  }
  const taskSnapshot = readTaskById(entry.id, taskId);
  if (!taskSnapshot) return c.json({ error: "Task not found" }, 404);
  const blockedTask = cliManageTaskError(c, entry.id, taskSnapshot);
  if (blockedTask) return blockedTask;
  const result = deleteTaskOnBoard(entry.id, taskId);
  if (!result) return c.json({ error: "Task not found" }, 404);
  publishBoardEvent({
    kind: "task-trashed",
    boardId: result.boardId,
    boardUpdatedAt: result.boardUpdatedAt,
    taskId: result.deletedTaskId,
  });
  publishBoardChanged(result.boardId, result.boardUpdatedAt);
  {
    const board = loadBoard(entry.id);
    if (board && taskSnapshot) recordTaskTrashed(c, entry, board, taskSnapshot, result);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliManageAnyTasksError(c, entry.id);
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
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (
    !("name" in body) &&
    !("emoji" in body) &&
    !("cliPolicy" in body) &&
    !("description" in body) &&
    !("boardColor" in body) &&
    !("defaultReleaseId" in body) &&
    !("autoAssignReleaseOnCreateUi" in body) &&
    !("autoAssignReleaseOnCreateCli" in body)
  ) {
    return c.json(
      {
        error:
          "At least one of name, emoji, cliPolicy, description, boardColor, defaultReleaseId, autoAssignReleaseOnCreateUi, or autoAssignReleaseOnCreateCli is required",
      },
      400,
    );
  }
  if (getRequestAuthContext(c).principal === "cli") {
    const hasReleasePatch =
      "defaultReleaseId" in body ||
      "autoAssignReleaseOnCreateUi" in body ||
      "autoAssignReleaseOnCreateCli" in body;
    if (hasReleasePatch) {
      const blockedRel = cliManageStructureError(c, entry.id);
      if (blockedRel) return blockedRel;
    }
    const hasMetadataPatch =
      "name" in body ||
      "emoji" in body ||
      "description" in body ||
      "boardColor" in body;
    if (hasMetadataPatch) {
      const blockedMeta = cliEditBoardMetadataError(c, entry.id);
      if (blockedMeta) return blockedMeta;
    }
  }
  const patch: {
    name?: string;
    emoji?: string | null;
    cliPolicy?: BoardCliPolicy;
    description?: string | null;
    boardColor?: Board["boardColor"];
    defaultReleaseId?: number | null;
    autoAssignReleaseOnCreateUi?: boolean;
    autoAssignReleaseOnCreateCli?: boolean;
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
  if ("cliPolicy" in body) {
    if (getRequestAuthContext(c).principal !== "web") {
      return c.json({ error: "Only the web app can change CLI policy" }, 403);
    }
    const parsed = parseBoardCliPolicy(body.cliPolicy);
    if (!parsed) {
      return c.json({ error: "Invalid cliPolicy" }, 400);
    }
    patch.cliPolicy = parsed;
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
  if ("defaultReleaseId" in body) {
    if (body.defaultReleaseId === null) {
      patch.defaultReleaseId = null;
    } else {
      const n = Number(body.defaultReleaseId);
      if (!Number.isFinite(n)) {
        return c.json({ error: "Invalid defaultReleaseId" }, 400);
      }
      patch.defaultReleaseId = n;
    }
  }
  if ("autoAssignReleaseOnCreateUi" in body) {
    if (typeof body.autoAssignReleaseOnCreateUi !== "boolean") {
      return c.json({ error: "autoAssignReleaseOnCreateUi must be a boolean" }, 400);
    }
    patch.autoAssignReleaseOnCreateUi = body.autoAssignReleaseOnCreateUi;
  }
  if ("autoAssignReleaseOnCreateCli" in body) {
    if (typeof body.autoAssignReleaseOnCreateCli !== "boolean") {
      return c.json({ error: "autoAssignReleaseOnCreateCli must be a boolean" }, 400);
    }
    patch.autoAssignReleaseOnCreateCli = body.autoAssignReleaseOnCreateCli;
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
  const blocked = cliBoardReadError(c, entry);
  if (blocked) return blocked;
  const board = loadBoard(entry.id);
  if (!board) return c.json({ error: "Board not found" }, 404);
  const statuses = listStatuses();
  const filter = parseBoardStatsFilter(new URL(c.req.url).searchParams);
  if (
    filter.activeGroupIds !== null &&
    filter.activeGroupIds.length > 0 &&
    !filter.activeGroupIds.every((g) => Number.isFinite(Number(g)))
  ) {
    return c.json({ error: "Invalid groupId" }, 400);
  }
  if (
    filter.activeReleaseIds !== null &&
    filter.activeReleaseIds.length > 0 &&
    !filter.activeReleaseIds.every(
      (r) => r === RELEASE_FILTER_UNTAGGED || Number.isFinite(Number(r)),
    )
  ) {
    return c.json({ error: "Invalid releaseId" }, 400);
  }
  const closedIds = closedStatusIdsFromStatuses(statuses);
  const stats = computeBoardStats(board, closedIds, filter);
  return c.json(stats);
});

boardsRoute.get("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blocked = cliBoardReadError(c, entry);
  if (blocked) return blocked;
  const bodyPreview = parseBoardFetchBodyPreview(c);
  const board = loadBoard(
    entry.id,
    bodyPreview !== undefined ? { taskBodyMaxChars: bodyPreview } : undefined,
  );
  if (!board) return c.json({ error: "Board not found" }, 404);
  return c.json(board);
});

boardsRoute.delete("/:id", async (c) => {
  const param = c.req.param("id");
  const entry = await entryByIdOrSlug(param);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  const blocked = cliDeleteBoardError(c, entry.id);
  if (blocked) return blocked;
  const snapshot = loadBoard(entry.id);
  if (!snapshot) return c.json({ error: "Board not found" }, 404);
  const trashed = trashBoardById(entry.id);
  if (!trashed) return c.json({ error: "Board not found" }, 404);
  publishBoardChanged(entry.id, trashed.boardUpdatedAt);
  recordBoardTrashed(c, entry, snapshot);
  return c.body(null, 204);
});
