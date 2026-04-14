# Trash Commands

Use `hirotm trash` to inspect what is currently in Trash. These commands are read-only; restore and purge are done through `boards`, `lists`, or `tasks`.

## Shared arguments

- `--limit <n>`: page size.
- `--offset <n>`: skip rows.
- `--page-all`: merge all pages.
- `--fields <keys>`: project only selected fields.
- Supports global `--quiet` with `--format ndjson`.

## Row meaning

- `trash list boards`: trashed boards.
- `trash list lists`: trashed lists with parent board context.
- `trash list tasks`: trashed tasks with parent board and list context.
- `canRestore`: whether restore is currently possible.

## Commands

### `trash list boards`

Format:

```bash
hirotm trash list boards [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]
```

List boards currently in Trash.

### `trash list lists`

Format:

```bash
hirotm trash list lists [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]
```

List trashed lists with their board context.

### `trash list tasks`

Format:

```bash
hirotm trash list tasks [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]
```

List trashed tasks with their board and list context.
