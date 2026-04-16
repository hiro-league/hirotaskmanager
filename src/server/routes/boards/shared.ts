import type { Context, MiddlewareHandler } from "hono";
import {
  TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1,
  TASK_MANAGER_MUTATION_RESPONSE_HEADER,
  type ListDeleteMutationResult,
  type ListMutationResult,
  type ReleaseDeleteMutationResult,
  type ReleaseMutationResult,
  type TaskDeleteMutationResult,
  type TaskMutationResult,
} from "../../../shared/mutationResults";
import {
  BOARD_FETCH_MAX_TASK_BODY_PREVIEW_CHARS,
  BOARD_FETCH_SLIM_TASK_BODY_CHARS,
} from "../../../shared/boardPayload";
import type { Board, BoardIndexEntry } from "../../../shared/models";
import type { AppBindings } from "../../auth";
import { cliBoardReadError } from "../../cliPolicyGuard";
import { entryByIdOrSlug, loadBoard } from "../../storage";

export const resolveBoardEntry: MiddlewareHandler<AppBindings> = async (c, next) => {
  const boardRef = c.req.param("id");
  if (!boardRef) return c.json({ error: "Board not found" }, 404);
  const entry = await entryByIdOrSlug(boardRef);
  if (!entry) return c.json({ error: "Board not found" }, 404);
  const blockedRead = cliBoardReadError(c, entry);
  if (blockedRead) return blockedRead;
  c.set("boardEntry", entry);
  await next();
};

export function requireBoardEntry(c: Context<AppBindings>): BoardIndexEntry {
  const entry = c.get("boardEntry");
  if (!entry) {
    throw new Error("Board entry missing from request context");
  }
  return entry;
}

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
export function parseBoardFetchBodyPreview(
  c: Context<AppBindings>,
): number | undefined {
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

export function taskMutationResponse(
  c: Context<AppBindings>,
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

export function taskDeleteResponse(
  c: Context<AppBindings>,
  result: TaskDeleteMutationResult,
) {
  if (wantsGranularMutationResponse(c)) {
    return c.json(result);
  }
  const saved = loadBoardAfterGranularWrite(result.boardId);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved);
}

export function listMutationResponse(
  c: Context<AppBindings>,
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

export function listDeleteResponse(
  c: Context<AppBindings>,
  result: ListDeleteMutationResult,
) {
  if (wantsGranularMutationResponse(c)) {
    return c.json(result);
  }
  const saved = loadBoardAfterGranularWrite(result.boardId);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved);
}

export function releaseMutationResponse(
  c: Context<AppBindings>,
  result: ReleaseMutationResult,
  status: 200 | 201,
) {
  if (wantsGranularMutationResponse(c)) {
    return c.json(result, status);
  }
  const saved = loadBoardAfterGranularWrite(result.boardId);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved, status);
}

export function releaseDeleteResponse(
  c: Context<AppBindings>,
  result: ReleaseDeleteMutationResult,
) {
  if (wantsGranularMutationResponse(c)) {
    return c.json(result);
  }
  const saved = loadBoardAfterGranularWrite(result.boardId);
  if (!saved) return c.json({ error: "Board not found" }, 404);
  return c.json(saved);
}
