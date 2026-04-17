# Lists Commands

Use `hirotm lists` to inspect and manage board columns. Lists belong to a board, so most commands require `--board <id-or-slug>`.

## Shared arguments

- `--board <id-or-slug>`: target board id or slug.
- `<list-id>`: numeric list id.
- `--yes`: use for non-interactive delete, restore, and purge commands.

### Position flags

Used by `lists move`. Pass exactly one.

- `--before <list-id>`: place before another list.
- `--after <list-id>`: place after another list.
- `--first`: move to the first position.
- `--last`: move to the last position.

## Commands

### `lists list`

Format:

```bash
hirotm lists list --board <id-or-slug> [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]
```

Use this to discover lists on a board before mutation.

- `--limit <n>`: page size.
- `--offset <n>`: skip rows.
- `--page-all`: merge all pages.
- `--fields <keys>`: project only selected fields.
- Supports global `--quiet` with `--format ndjson`.

### `lists show`

Format:

```bash
hirotm lists show <list-id> [--fields <keys>]
```

Print one list by global numeric id (`GET /api/lists/:listId`). The server resolves which board the list belongs to and enforces CLI policy for that board (`readBoard`).

### `lists add`

Format:

```bash
hirotm lists add --board <id-or-slug> [name] [--emoji <text>]
```

Create a new list on a board.

- `[name]`: list name. Optional.
- `--emoji <text>`: emoji prefix for the list.

### `lists update`

Format:

```bash
hirotm lists update --board <id-or-slug> <list-id> [--name <text>] [--color <css> | --clear-color] [--emoji <text> | --clear-emoji]
```

Update list fields. Pass at least one change.

- `--name <text>`: rename the list.
- `--color <css>`: set a CSS color value.
- `--clear-color`: remove the list color.
- `--emoji <text>` or `--clear-emoji`: set or clear emoji.

### `lists move`

Format:

```bash
hirotm lists move --board <id-or-slug> <list-id> [--before <list-id> | --after <list-id> | --first | --last]
```

Reorder a list within a board.

- Position flags are listed once in `Position flags`.

### `lists delete`

Format:

```bash
hirotm lists delete --board <id-or-slug> <list-id> --yes
```

Move a list to Trash.

### `lists restore`

Format:

```bash
hirotm lists restore <list-id> --yes
```

Restore a trashed list.

### `lists purge`

Format:

```bash
hirotm lists purge <list-id> --yes
```

Permanently delete a trashed list. This is irreversible.
