import { Hono } from "hono";
import type { SearchHit } from "../../shared/models";
import { cliBoardAccessError, isCliRequest } from "../cliBoardGuard";
import { entryByIdOrSlug } from "../storage/board";
import { searchTasks } from "../storage/search";

export const searchRoute = new Hono();

/** Default: prefix-match on last token (`drag*`); `0`, `false`, `no` disables. */
function parsePrefixQuery(raw: string | undefined): boolean {
  if (raw === undefined || raw.trim() === "") return true;
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

searchRoute.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  if (!q) {
    return c.json({ error: "Query required" }, 400);
  }

  const cli = isCliRequest(c);

  let limit = 20;
  const limitRaw = c.req.query("limit");
  if (limitRaw !== undefined && limitRaw !== "") {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || n < 1) {
      return c.json({ error: "Invalid limit" }, 400);
    }
    limit = Math.min(50, Math.floor(n));
  }

  let boardId: number | undefined;
  const boardParam = c.req.query("board")?.trim();
  if (boardParam) {
    const entry = await entryByIdOrSlug(boardParam);
    if (!entry) {
      return c.json({ error: "Board not found" }, 404);
    }
    const blocked = cliBoardAccessError(c, entry, "read");
    if (blocked) return blocked;
    boardId = entry.id;
  }

  const prefixRaw = c.req.query("prefix");
  const prefixFinalToken = parsePrefixQuery(prefixRaw);

  let hits: SearchHit[];
  try {
    hits = searchTasks({
      q,
      boardId,
      limit,
      prefixFinalToken,
      excludeCliNoneBoards: cli,
    });
  } catch {
    // Malformed FTS5 MATCH syntax (e.g. unmatched quotes) surfaces as a SQLite error.
    return c.json({ error: "Invalid search query" }, 400);
  }

  return c.json(hits);
});
