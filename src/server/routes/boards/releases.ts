import { Hono } from "hono";
import { paginateInMemory } from "../../../shared/pagination";
import type { AppBindings } from "../../auth";
import { cliManageStructureError } from "../../cliPolicyGuard";
import { publishBoardChanged, publishBoardEvent } from "../../events";
import { parseListPagination } from "../../lib/listPagination";
import {
  createBoardRelease,
  deleteBoardRelease,
  loadBoard,
  updateBoardRelease,
} from "../../storage";
import {
  releaseDeleteResponse,
  releaseMutationResponse,
  requireBoardEntry,
} from "./shared";

export const boardReleasesRoute = new Hono<AppBindings>();

boardReleasesRoute.get("/:id/releases", async (c) => {
  const entry = requireBoardEntry(c);
  const board = loadBoard(entry.boardId);
  if (!board) return c.json({ error: "Board not found" }, 404);
  const page = parseListPagination(new URL(c.req.url).searchParams, {
    defaultLimit: null,
  });
  if (!page.ok) {
    return c.json({ error: page.error }, 400);
  }
  return c.json(paginateInMemory(board.releases, page.offset, page.limit));
});

boardReleasesRoute.post("/:id/releases", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliManageStructureError(c, entry.boardId);
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
  const created = createBoardRelease(entry.boardId, {
    name,
    color,
    releaseDate,
  });
  if (!created) {
    // Duplicate `(board_id, name)` or rare DB failure — treat as conflict for agents (HTTP 409 → hirotm exit 5).
    return c.json(
      {
        error:
          "A release with this name already exists on this board.",
      },
      409,
    );
  }
  const board = loadBoard(entry.boardId);
  if (board) {
    // Granular SSE: other tabs merge `releases` without refetching the full board (phase 5 sync).
    publishBoardEvent({
      kind: "release-upserted",
      boardId: entry.boardId,
      boardUpdatedAt: board.updatedAt,
      release: created,
    });
  }
  return releaseMutationResponse(
    c,
    {
      boardId: entry.boardId,
      boardSlug: entry.slug,
      boardUpdatedAt: board?.updatedAt ?? created.createdAt,
      entity: created,
    },
    201,
  );
});

boardReleasesRoute.patch("/:id/releases/:releaseId", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliManageStructureError(c, entry.boardId);
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
  const updated = updateBoardRelease(entry.boardId, releaseId, input);
  if (!updated.ok) {
    if (updated.reason === "not_found") {
      return c.json({ error: "Release not found" }, 404);
    }
    if (updated.reason === "duplicate_name") {
      return c.json(
        {
          error:
            "A release with this name already exists on this board.",
        },
        409,
      );
    }
    return c.json({ error: "Invalid release update" }, 400);
  }
  const board = loadBoard(entry.boardId);
  if (board) {
    publishBoardEvent({
      kind: "release-upserted",
      boardId: entry.boardId,
      boardUpdatedAt: board.updatedAt,
      release: updated.release,
    });
  }
  return releaseMutationResponse(
    c,
    {
      boardId: entry.boardId,
      boardSlug: entry.slug,
      boardUpdatedAt: board?.updatedAt ?? updated.release.createdAt,
      entity: updated.release,
    },
    200,
  );
});

boardReleasesRoute.delete("/:id/releases/:releaseId", async (c) => {
  const entry = requireBoardEntry(c);
  const blocked = cliManageStructureError(c, entry.boardId);
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
  const ok = deleteBoardRelease(entry.boardId, releaseId, options);
  if (!ok) return c.json({ error: "Release not found or invalid move target" }, 400);
  const board = loadBoard(entry.boardId);
  if (board) publishBoardChanged(entry.boardId, board.updatedAt);
  return releaseDeleteResponse(c, {
    boardId: entry.boardId,
    boardSlug: entry.slug,
    boardUpdatedAt: board?.updatedAt ?? new Date().toISOString(),
    deletedReleaseId: releaseId,
  });
});
