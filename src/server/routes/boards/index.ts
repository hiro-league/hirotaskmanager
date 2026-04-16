import { Hono } from "hono";
import {
  type BoardCliPolicy,
  parseBoardCliPolicy,
} from "../../../shared/cliPolicy";
import { parseEmojiField } from "../../../shared/emojiField";
import { RELEASE_FILTER_UNTAGGED } from "../../../shared/boardFilters";
import {
  closedStatusIdsFromStatuses,
  computeBoardStats,
  parseBoardStatsFilter,
} from "../../../shared/boardStats";
import { parseBoardDescribeEntities } from "../../../shared/boardDescribe";
import { paginateInMemory } from "../../../shared/pagination";
import type { Board } from "../../../shared/models";
import { parseListPagination } from "../../lib/listPagination";
import {
  createBoardWithDefaults,
  generateSlug,
  listStatuses,
  loadBoard,
  loadBoardDescribe,
  patchBoard,
  readBoardIndex,
  trashBoardById,
} from "../../storage";
import { readBoardCliPolicy } from "../../storage/system/cliPolicy";
import { getRequestAuthContext, type AppBindings } from "../../auth";
import {
  cliCreateBoardDeniedError,
  cliDeleteBoardError,
  cliEditBoardMetadataError,
  cliManageStructureError,
} from "../../cliPolicyGuard";
import { provenanceForWrite } from "../../provenance";
import {
  publishBoardChanged,
  publishBoardIndexChanged,
} from "../../events";
import {
  recordBoardCreated,
  recordBoardPatched,
  recordBoardTrashed,
} from "../../notifications/recordBoard";
import { boardListsRoute } from "./lists";
import { boardReleasesRoute } from "./releases";
import { boardSettingsRoute } from "./settings";
import { boardTasksRoute } from "./tasks";
import {
  parseBoardFetchBodyPreview,
  requireBoardEntry,
  resolveBoardEntry,
} from "./shared";

export const boardsRoute = new Hono<AppBindings>();

boardsRoute.get("/", async (c) => {
  const index = await readBoardIndex();
  const rows =
    getRequestAuthContext(c).principal === "web"
      ? index
      : index.filter((entry) => readBoardCliPolicy(entry.boardId)?.readBoard);
  const page = parseListPagination(new URL(c.req.url).searchParams, {
    defaultLimit: null,
  });
  if (!page.ok) {
    return c.json({ error: page.error }, 400);
  }
  return c.json(paginateInMemory(rows, page.offset, page.limit));
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
  publishBoardChanged(board.boardId, board.updatedAt);
  publishBoardIndexChanged();
  recordBoardCreated(c, board);
  return c.json(board, 201);
});

boardsRoute.use("/:id", resolveBoardEntry);
boardsRoute.use("/:id/*", resolveBoardEntry);

boardsRoute.route("/", boardSettingsRoute);
boardsRoute.route("/", boardReleasesRoute);
boardsRoute.route("/", boardListsRoute);
boardsRoute.route("/", boardTasksRoute);

boardsRoute.patch("/:id", async (c) => {
  const entry = requireBoardEntry(c);
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
      const blockedRel = cliManageStructureError(c, entry.boardId);
      if (blockedRel) return blockedRel;
    }
    const hasMetadataPatch =
      "name" in body ||
      "emoji" in body ||
      "description" in body ||
      "boardColor" in body;
    if (hasMetadataPatch) {
      const blockedMeta = cliEditBoardMetadataError(c, entry.boardId);
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
  const saved = await patchBoard(entry.boardId, patch);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  publishBoardChanged(entry.boardId, saved.updatedAt);
  if (
    "name" in body ||
    "emoji" in body ||
    "description" in body ||
    "cliPolicy" in body
  ) {
    publishBoardIndexChanged();
  }
  recordBoardPatched(c, entry, saved);
  return c.json(saved);
});

// Registered before `GET /:id` so `:id` does not capture literals like `describe` or `stats`.
boardsRoute.get("/:id/describe", async (c) => {
  const entry = requireBoardEntry(c);
  const rawEntities = c.req.query("entities");
  const parsed = parseBoardDescribeEntities(
    rawEntities === null || rawEntities === undefined
      ? undefined
      : rawEntities,
  );
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }
  const body = loadBoardDescribe(entry.boardId, parsed);
  if (!body) return c.json({ error: "Board not found" }, 404);
  return c.json(body);
});

boardsRoute.get("/:id/stats", async (c) => {
  const entry = requireBoardEntry(c);
  const board = loadBoard(entry.boardId);
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
  const entry = requireBoardEntry(c);
  const bodyPreview = parseBoardFetchBodyPreview(c);
  const board = loadBoard(
    entry.boardId,
    bodyPreview !== undefined ? { taskBodyMaxChars: bodyPreview } : undefined,
  );
  if (!board) return c.json({ error: "Board not found" }, 404);
  return c.json(board);
});

boardsRoute.delete("/:id", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliDeleteBoardError(c, entry.boardId);
  if (blocked) return blocked;
  const snapshot = loadBoard(entry.boardId);
  if (!snapshot) return c.json({ error: "Board not found" }, 404);
  const trashed = trashBoardById(entry.boardId);
  if (!trashed) return c.json({ error: "Board not found" }, 404);
  publishBoardChanged(entry.boardId, trashed.boardUpdatedAt);
  publishBoardIndexChanged();
  recordBoardTrashed(c, entry, snapshot);
  return c.body(null, 204);
});
