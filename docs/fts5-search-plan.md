# FTS5 Search Plan

**Status:** Phase 1–3 are implemented: FTS5 index (task text + list / group / status labels, with rename triggers), `GET /api/search`, `hirotm search`, Phase 2 snippet/prefix/table behavior.

## Overview

Add SQLite FTS5-backed task search to TaskManager and expose it through both the HTTP API and the `hirotm` CLI.

Initial scope stays intentionally small:

- Search `task.title`
- Search `task.body`
- Support global search across all boards
- Support board-scoped search
- Return compact JSON search results

The CLI remains an HTTP client over the local API. It does not query SQLite directly.

---

## Goals

| ID | Goal |
|----|------|
| G1 | Search all tasks across the whole app |
| G2 | Search tasks within a specific board |
| G3 | Start with `title` and `body` only |
| G4 | Keep the CLI JSON-first and AI-friendly |
| G5 | Reuse existing API and board resolution patterns |

## Non-goals (Phase 1)

- Search list names
- Search task group labels
- Search status labels
- Client UI search
- Human-oriented table output in the CLI

---

## Proposed API

Add one read-only endpoint:

```http
GET /api/search?q=<query>&board=<id-or-slug>&limit=<n>&prefix=<0|1>
```

### Query parameters

| Param | Required | Notes |
|-------|----------|-------|
| `q` | yes | Raw search query string |
| `board` | no | Numeric board id or slug |
| `limit` | no | Default `20`, cap at `50` |
| `prefix` | no | Default on: last token gets a `*` for prefix match; `0` / `false` / `no` disables |

### Behavior

- If `board` is omitted, search all tasks.
- If `board` is present, resolve it with the existing board id/slug lookup and search only that board.
- If the board is unknown, return `404`.
- If `q` is blank, return `400`.
- Unless `prefix` disables it, the server appends `*` to the last token (queries with `"`, `(`, `)`, or `:` are left as-is for advanced FTS5 syntax).

### Response shape

Return compact hits, not full board payloads:

```json
[
  {
    "taskId": 42,
    "boardId": 3,
    "boardSlug": "my-project",
    "boardName": "My Project",
    "title": "Add FTS5 search",
    "snippet": "Need search over task title and body...",
    "score": -7.42
  }
]
```

`score` can come from `bm25(...)`. Lower is better in SQLite FTS5 ranking.

---

## Proposed CLI

Add a top-level command:

```bash
hirotm search <query> [--board <id-or-slug>] [--limit <n>] [--port <port>]
```

### Examples

```bash
hirotm search "fts5"
hirotm search "drag drop" --board my-project
hirotm search "bug" --board 12 --limit 20
```

### Rationale

- Search is cross-cutting, not only a board subcommand.
- The same command supports both global and board-scoped search.
- It fits the existing CLI style: JSON output via the local API.

---

## Proposed SQLite design

Add an FTS5 virtual table for task text:

```sql
CREATE VIRTUAL TABLE task_search USING fts5(
  task_id UNINDEXED,
  board_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
```

### Notes

- `task_id` and `board_id` are stored for filtering and result mapping.
- Phase 1 indexes only `title` and `body`.
- Title should rank higher than body in `bm25`.

Example query shape:

```sql
SELECT
  task_id,
  board_id,
  bm25(task_search, 8.0, 2.0) AS score,
  snippet(task_search, 1, '<mark>', '</mark>', ' ... ', 12) AS snippet
FROM task_search
WHERE task_search MATCH ?
ORDER BY score
LIMIT ?;
```

Board filtering can be applied by joining or constraining through the stored `board_id`.

---

## Sync strategy

For the first phase, keep index maintenance in the application layer rather than SQL triggers.

### Why

- Task writes are already centralized in `src/server/storage/tasks.ts`
- This keeps the migration simple
- It is easier to evolve while indexed fields are still changing

### Expected helpers

- `indexTask(taskId: number): void`
- `deleteTaskIndex(taskId: number): void`
- `rebuildTaskSearchIndex(): void`
- `searchTasks(query: string, options?: { boardId?: number; limit?: number }): SearchResult[]`

---

## Implementation steps

### 1. Migration

Add `migration003_search`:

- create `task_search`
- backfill from existing `task` rows
- register migration in `src/server/migrations/registry.ts`

### 2. Search storage module

Add a server storage module, for example `src/server/storage/search.ts`:

- build or rebuild the FTS index
- update one indexed task row
- remove one indexed task row
- run search queries and return compact results

### 3. Update task write paths

Update task storage flows so the index stays current:

- `createTaskOnBoard()`
- `patchTaskOnBoard()`
- `deleteTaskOnBoard()`

### 4. Add API route

Add `GET /api/search`:

- validate `q`
- parse `limit`
- resolve optional board id/slug
- call `searchTasks(...)`

### 5. Wire server route

Register the route in `src/server/index.ts`.

### 6. Add CLI command

Extend `src/cli/index.ts`:

- add `hirotm search <query>`
- support `--board`, `--limit`, `--port`
- call `/api/search` using `fetchApi(...)`

### 7. Document usage

Update user-facing docs after implementation:

- README examples
- CLI design doc if the command should be part of the stable CLI surface

---

## Expected phases

### Phase 1 — Minimal useful search

Scope:

- FTS5 on `task.title` and `task.body`
- Global and board-scoped API search
- `hirotm search`
- JSON results with task and board identity, title, snippet, and score

### Phase 2 — Query quality and UX

**Done.** Scope delivered:

- Snippets from both title and body columns, merged with ` — `; match spans use `«…»`.
- `bm25` weights `0, 0, 12, 4` (UNINDEXED ids, then title, body).
- Last search token gets a trailing `*` by default (prefix match); disable with `GET /api/search?...&prefix=0` or `hirotm search ... --no-prefix`. Queries containing `"`, `(`, `)`, or `:` are passed through unchanged.
- CLI: `hirotm search --format table` for fixed-width columns; default remains JSON.

### Phase 3 — Richer indexed fields

**Done.** Migration `004_task_search_extended` replaces `task_search` with columns `list_name`, `group_label`, `status_label` (joined from `list`, `task_group`, `status`). Triggers on `list` (name), `task_group` (label), and `status` (label) reindex affected tasks. `bm25` weights: `0,0,12,4,3,3,2` for the seven FTS columns.

### Phase 4 — Client UI search

**Done (board-only first).** Delivered:

- Modal search (`BoardSearchDialog`) while viewing a board; state is in-session only (no URL/query params).
- Open via **K** or **F3** (when focus is not in an editable field) and via the **Search** control next to the board name in the board header.
- Results show **list name** and **task title**; API **snippet** text is shown when present (Phase 2/3 behavior unchanged).
- Choosing a result opens the task the same way as clicking a card (`requestOpenTaskEditor`).
- Query is debounced (~250ms). No extra client filters (`listId`, group, etc.) in this pass.

---

## Future additions

Brief backlog (not scheduled); pick based on product need.

- **Global web search** — UI over existing parameterless-board `GET /api/search` (compact hits with board name/slug; open task and/or navigate to board). Sidebar or command-palette entry.
- **Board modal polish** — Arrow keys + Enter on the result list; optional scroll or flash the task card after open when it was off-screen.
- **Filters** — Narrow hits by list, group, or status (API and/or client) for very large boards.
- **Docs & hints** — README search overview; optional in-dialog line on FTS tokens vs substrings and phrase syntax.
- **Robustness** — Cancel in-flight fetches on new query (`AbortController`); clearer empty and error states.
- **URLs** — Shareable or bookmarkable `?q=` only if that workflow matters (today search is in-session).
- **Indexing** — Additional fields (e.g. tags) if the data model gains them.

---

## Risks / notes

- FTS5 matches tokens, not arbitrary substrings.
- Prefix matching may need explicit `*` handling if desired.
- Markdown in `task.body` is acceptable for Phase 1, but formatting syntax may add some noise.
- Global search should return compact records to avoid loading full boards for each query.

---

## Recommendation

Implement global and board-scoped search in Phase 1, but keep the indexed fields limited to `task.title` and `task.body`. That delivers immediate CLI value without over-complicating indexing and reindexing behavior.
