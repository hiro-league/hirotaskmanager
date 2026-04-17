# Lists Commands

Use `hirotm lists` to inspect and manage board columns. **`lists list`** and **`lists add`** require `--board`. **`lists show`**, **`lists update`**, **`lists move`**, and **`lists delete`** take a global list id only; the CLI resolves the board from that id.

## Shared arguments

- `--board <id-or-slug>`: target board id or slug (required for `lists list` and `lists add` only).
- `<list-id>`: numeric global list id.
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
hirotm lists list --board <id-or-slug> [--limit <n>] [--offset <n>] [--page-all] [--count-only] [--fields <keys>]
```

Use this to discover lists on a board before mutation.

- `--limit <n>`: page size.
- `--offset <n>`: skip rows.
- `--page-all`: merge all pages.
- `--count-only`: return only the total matching row count.
- `--fields <keys>`: project only selected fields (allowlist includes e.g. `boardId`, `boardSlug` alongside list fields).
- Supports global `--quiet` with `--format ndjson`.

### `lists show`

Format:

```bash
hirotm lists show <list-id> [--fields <keys>]
```

Print one list by global numeric id

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
hirotm lists update <list-id> [--name <text>] [--color <css> | --clear-color] [--emoji <text> | --clear-emoji]
```

Update list fields. Pass at least one change.

- `--name <text>`: rename the list.
- `--color <css>`: set a CSS color value.
- `--clear-color`: remove the list color.
- `--emoji <text>` or `--clear-emoji`: set or clear emoji.

### `lists move`

Format:

```bash
hirotm lists move <list-id> [--before <list-id> | --after <list-id> | --first | --last]
```

Reorder a list within a board.

- Position flags are listed once in `Position flags`.

### `lists delete`

Format:

```bash
hirotm lists delete <list-id> [--dry-run] --yes
```

Move a list to Trash.

- `--dry-run`: preview the planned request without mutating data.

### `lists restore`

Format:

```bash
hirotm lists restore <list-id> --yes
```

Restore a trashed list.

### `lists purge`

Format:

```bash
hirotm lists purge <list-id> [--dry-run] --yes
```

Permanently delete a trashed list. This is irreversible.

- `--dry-run`: preview the planned request without mutating data.
