# Boards Commands

Use `hirotm boards` to discover boards, inspect board structure, and manage board-level settings. Use `hirotm tasks list --board <id-or-slug>` for task rows; `boards describe` does not return tasks.


## Shared arguments

- `<id-or-slug>`: board numeric id or board slug.
- `--yes`: use for non-interactive destructive or structural commands.

### Text input variants

Used by board create or update when setting descriptions.

- `--description <text>`: inline text.
- `--description-file <path>`: read text from file.
- `--description-stdin`: read text from stdin.

### JSON input variants

Used by `boards configure groups` and `boards configure priorities`. Pass exactly one.

- `--json <text>`: inline JSON.
- `--file <path>`: read JSON from file.
- `--stdin`: read JSON from stdin.

## Commands

### `boards list`

Format:

```bash
hirotm boards list [--limit <n>] [--offset <n>] [--page-all] [--count-only] [--fields <keys>]
```

Use this to discover accessible boards before mutation.

- `--limit <n>`: page size.
- `--offset <n>`: skip rows.
- `--page-all`: merge all pages.
- `--count-only`: return only the total matching row count.
- `--fields <keys>`: project only selected fields.
- Supports global `--quiet` with `--format ndjson`.

### `boards describe <id-or-slug>`

Format:

```bash
hirotm boards describe <id-or-slug> [--entities <csv>]
```

Use this to inspect one board without loading tasks.

- Best source for `listId`, `groupId`, `priority`, `releaseId`, and status ids.
- `--entities <csv>` accepts `list`, `group`, `priority`, `release`, `status`, `meta`.
- Omitting `--entities` returns the standard entity sections without `meta`.
- There is no `boards show`; pair `boards describe` with `tasks list --board` when task rows are needed.

### `boards add [name]`

Format:

```bash
hirotm boards add [name] [--emoji <text>] [description flags]
```

Create a new board.

- `[name]`: board name. Optional.
- `--emoji <text>`: emoji prefix for the board.
- Description flags are listed once in `Text input variants`.

### `boards update <id-or-slug>`

Format:

```bash
hirotm boards update <id-or-slug> [--name <text>] [--emoji <text> | --clear-emoji] [description flags | --clear-description] [--board-color <preset> | --clear-board-color]
```

Update board identity or appearance. Pass at least one change.

- `--name <text>`: rename the board.
- `--emoji <text>` or `--clear-emoji`: set or clear emoji.
- Description flags are listed once in `Text input variants`.
- `--clear-description`: remove the description.
- `--board-color <preset>`: one of `stone`, `cyan`, `azure`, `indigo`, `violet`, `rose`, `amber`, `emerald`, `coral`, `sage`.
- `--clear-board-color`: remove the color preset.

### `boards delete <id-or-slug>`

Format:

```bash
hirotm boards delete <id-or-slug> [--dry-run] --yes
```

Move a board to Trash.

- `--dry-run`: preview the planned request without mutating data.

### `boards restore <id-or-slug>`

Format:

```bash
hirotm boards restore <id-or-slug> --yes
```

Restore a trashed board.

### `boards purge <id-or-slug>`

Format:

```bash
hirotm boards purge <id-or-slug> [--dry-run] --yes
```

Permanently delete a trashed board. This is irreversible.

- `--dry-run`: preview the planned request without mutating data.

### `boards configure groups <id-or-slug>`

Format:

```bash
hirotm boards configure groups <id-or-slug> [--json <text> | --file <path> | --stdin] [--dry-run] --yes
```

Replace board task groups from JSON input.

- JSON input variants are listed once in `JSON input variants`.
- `--dry-run`: preview the planned request without mutating data.

### `boards configure priorities <id-or-slug>`

Format:

```bash
hirotm boards configure priorities <id-or-slug> [--json <text> | --file <path> | --stdin] [--dry-run] --yes
```

Replace board priorities from JSON input.

- JSON input variants are listed once in `JSON input variants`.
- `--dry-run`: preview the planned request without mutating data.
