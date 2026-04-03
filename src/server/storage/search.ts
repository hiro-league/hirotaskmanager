import type { Database } from "bun:sqlite";
import type { SearchHit } from "../../shared/models";
import { getDb } from "../db";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * bm25 weights for task_search columns:
 * task_id, board_id (UNINDEXED), title, body, list_name, group_label, status_label
 */
const BM25_W = [0, 0, 12, 4, 3, 3, 2] as const;

/**
 * Build an FTS5 MATCH string. When `prefixFinalToken` is true, appends `*` to the
 * last token so partial-word matches work (e.g. `drag` matches `dragging`), unless the
 * input looks like an explicit FTS5 expression (quotes, parens, column filters).
 */
export function buildFtsMatchQuery(
  raw: string,
  options: { prefixFinalToken: boolean },
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!options.prefixFinalToken) return trimmed;

  if (/["():]/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 0) return "";
  const last = parts[parts.length - 1]!;
  if (last.endsWith("*")) {
    return trimmed;
  }
  parts[parts.length - 1] = `${last}*`;
  return parts.join(" ");
}

function mergeSnippets(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(" — ");
}

/**
 * Search indexed task fields (title, body, list name, group label, status label).
 * Triggers keep `task_search` in sync with tasks and with list/group/status renames.
 */
export function searchTasks(options: {
  q: string;
  boardId?: number;
  limit?: number;
  /** Default true: last token gets a `*` prefix suffix for partial matches. */
  prefixFinalToken?: boolean;
  /** When true, omit hits on boards whose CLI access is `none` (hirotm global search). */
  excludeCliNoneBoards?: boolean;
}): SearchHit[] {
  const db = getDb();
  const matchQuery = buildFtsMatchQuery(options.q, {
    prefixFinalToken: options.prefixFinalToken !== false,
  });
  if (!matchQuery) return [];

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, options.limit ?? DEFAULT_LIMIT),
  );

  return runSearch(db, matchQuery, options.boardId, limit, {
    excludeCliNoneBoards: options.excludeCliNoneBoards === true,
  });
}

function runSearch(
  db: Database,
  matchQuery: string,
  boardId: number | undefined,
  limit: number,
  opts: { excludeCliNoneBoards: boolean },
): SearchHit[] {
  const bm25Expr = `bm25(task_search, ${BM25_W.join(", ")})`;
  const snipCols = `
           snippet(task_search, 2, '«', '»', ' … ', 36) AS snip_title,
           snippet(task_search, 3, '«', '»', ' … ', 56) AS snip_body,
           snippet(task_search, 4, '«', '»', ' … ', 28) AS snip_list,
           snippet(task_search, 5, '«', '»', ' … ', 28) AS snip_group,
           snippet(task_search, 6, '«', '»', ' … ', 20) AS snip_status`;
  const cliFilter = opts.excludeCliNoneBoards ? "AND b.cli_access != 'none'" : "";

  if (boardId !== undefined) {
    const rows = db
      .query(
        `SELECT
           task_search.task_id AS task_id,
           task_search.board_id AS board_id,
           b.slug AS board_slug,
           b.name AS board_name,
           l.name AS list_name,
           t.title AS title,
           ${bm25Expr} AS score,
           ${snipCols}
         FROM task_search
         INNER JOIN board AS b ON b.id = task_search.board_id
         INNER JOIN task AS t ON t.id = task_search.task_id
         INNER JOIN list AS l ON l.id = t.list_id AND l.board_id = t.board_id
         WHERE task_search MATCH ? AND task_search.board_id = ? ${cliFilter}
         ORDER BY score
         LIMIT ?`,
      )
      .all(matchQuery, boardId, limit) as SearchRow[];
    return rows.map(mapRow);
  }

  const rows = db
    .query(
      `SELECT
         task_search.task_id AS task_id,
         task_search.board_id AS board_id,
         b.slug AS board_slug,
         b.name AS board_name,
         l.name AS list_name,
         t.title AS title,
         ${bm25Expr} AS score,
         ${snipCols}
       FROM task_search
       INNER JOIN board AS b ON b.id = task_search.board_id
       INNER JOIN task AS t ON t.id = task_search.task_id
       INNER JOIN list AS l ON l.id = t.list_id AND l.board_id = t.board_id
       WHERE task_search MATCH ? ${cliFilter}
       ORDER BY score
       LIMIT ?`,
    )
    .all(matchQuery, limit) as SearchRow[];
  return rows.map(mapRow);
}

type SearchRow = {
  task_id: number;
  board_id: number;
  board_slug: string;
  board_name: string;
  list_name: string;
  title: string;
  score: number;
  snip_title: string;
  snip_body: string;
  snip_list: string;
  snip_group: string;
  snip_status: string;
};

function mapRow(r: SearchRow): SearchHit {
  return {
    taskId: r.task_id,
    boardId: r.board_id,
    boardSlug: r.board_slug,
    boardName: r.board_name,
    listName: r.list_name,
    title: r.title,
    snippet: mergeSnippets(
      r.snip_title,
      r.snip_body,
      r.snip_list,
      r.snip_group,
      r.snip_status,
    ),
    score: r.score,
  };
}
