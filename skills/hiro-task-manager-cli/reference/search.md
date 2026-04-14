# Search Commands

Use `hirotm query search` for full-text task search across indexed task fields such as title, body, list name, group label, and status label.

## Command

### `query search <query...>`

Format:

```bash
hirotm query search <query...> [--board <id-or-slug>] [--limit <n>] [--offset <n>] [--page-all] [--no-prefix] [--fields <keys>]
```

Search tasks by text.

- `<query...>`: search text. Quote phrases when needed.
- `--board <id-or-slug>`: limit hits to one board.
- `--limit <n>`: page size. Defaults to `20` when omitted.
- `--offset <n>`: skip rows.
- `--page-all`: merge all pages.
- `--no-prefix`: disable automatic prefix matching on the last token.
- `--fields <keys>`: project only selected fields.
- Supports global `--quiet` with `--format ndjson`.

## Search behavior

- By default, the last token is prefix-matched unless `--no-prefix` is used.
- Results are ordered by relevance score, best matches first.
- Invalid search syntax returns an error.

## Result fields

- `taskId`: global task id.
- `boardSlug` / `boardName`: where the task lives.
- `listName`: list name for the hit.
- `snippet`: short excerpt with match context.
- `score`: relevance score; lower is better.
