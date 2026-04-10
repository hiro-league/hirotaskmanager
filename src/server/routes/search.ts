import { Hono } from "hono";
import type { AppBindings } from "../auth";
import { cliBoardReadError, isCliRequest } from "../cliPolicyGuard";
import { parseListPagination } from "../lib/listPagination";
import { entryByIdOrSlug } from "../storage/board";
import { searchTasksPaginated } from "../storage/search";

export const searchRoute = new Hono<AppBindings>();

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

  const page = parseListPagination(new URL(c.req.url).searchParams, {
    defaultLimit: 20,
  });
  if (!page.ok) {
    return c.json({ error: page.error }, 400);
  }
  const { offset, limit } = page;
  // defaultLimit 20 ensures `limit` is always set for search.
  if (limit == null) {
    return c.json({ error: "Invalid pagination" }, 400);
  }

  let boardId: number | undefined;
  const boardParam = c.req.query("board")?.trim();
  if (boardParam) {
    const entry = await entryByIdOrSlug(boardParam);
    if (!entry) {
      return c.json({ error: "Board not found" }, 404);
    }
    const blocked = cliBoardReadError(c, entry);
    if (blocked) return blocked;
    boardId = entry.boardId;
  }

  const prefixRaw = c.req.query("prefix");
  const prefixFinalToken = parsePrefixQuery(prefixRaw);

  let body;
  try {
    body = searchTasksPaginated({
      q,
      boardId,
      offset,
      limit,
      prefixFinalToken,
      excludeCliNoneBoards: cli,
    });
  } catch {
    // Malformed FTS5 MATCH syntax (e.g. unmatched quotes) surfaces as a SQLite error.
    return c.json({ error: "Invalid search query" }, 400);
  }

  return c.json(body);
});
