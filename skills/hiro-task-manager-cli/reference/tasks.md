# Tasks Commands

Use `hirotm tasks` to inspect, create, update, move, and remove tasks on a board.

## Shared arguments

- `--board <id-or-slug>`: required for **`tasks list`** and **`tasks add`** (board-scoped listing and creation).
- `<task-id>`: numeric global task id (required for `tasks show`, `tasks update`, `tasks move`, `tasks delete`, restore/purge).
- `--yes`: use for non-interactive delete, restore, and purge commands.

### Body input variants

Used by `tasks add` and `tasks update` when setting the task body.

- `--body <text>`: inline Markdown text.
- `--body-file <path>`: read body from file.
- `--body-stdin`: read body from stdin.

### Release selectors

Used by `tasks add` and `tasks update`. Use only one release selector at a time.

- `--release <name>`: select a release by exact name.
- `--release none`: explicitly leave the task untagged.
- `--release-id <id>`: select a release by numeric id.
- Omit both release flags to allow server defaults or auto-assignment when configured.

### Move position flags

Used by `tasks move`. Pass exactly one when you need placement control.

- `--before-task <id>`: place before another task.
- `--after-task <id>`: place after another task.
- `--first`: move to the first position.
- `--last`: move to the last position.

## Commands

### `tasks list`

Format:

```bash
hirotm tasks list --board <id-or-slug> [--list <id>] [--group <id>...] [--priority <id>...] [--status <id>...] [--release-id <id>...] [--untagged] [--date-mode opened|closed|any] [--from <yyyy-mm-dd>] [--to <yyyy-mm-dd>] [--limit <n>] [--offset <n>] [--page-all] [--count-only] [--fields <keys>]
```

Use this to inspect tasks on a board and narrow the result set before mutation.

- `--list <id>`: filter to one list.
- `--group <id>...`: filter by group id; repeat or use comma-separated values.
- `--priority <id>...`: filter by priority id; repeat or use comma-separated values.
- `--status <id>...`: filter by workflow status id; repeat or use comma-separated values.
- `--release-id <id>...`: filter by release id; repeat or use comma-separated values.
- `--untagged`: include tasks without a release; combine with `--release-id` as OR.
- `--date-mode`: use `opened`, `closed`, or `any`.
- `--from <yyyy-mm-dd>` / `--to <yyyy-mm-dd>`: inclusive date range.
- `--limit <n>`: page size.
- `--offset <n>`: skip rows.
- `--page-all`: merge all pages.
- `--count-only`: return only the total matching row count.
- `--fields <keys>`: project only selected fields (allowlist includes e.g. `boardId`, `boardSlug` alongside task fields).
- Supports global `--quiet` with `--format ndjson`.

### `tasks show`

Format:

```bash
hirotm tasks show <task-id> [--fields <keys>]
```

Print one task by global numeric id

### `tasks add`

Format:

```bash
hirotm tasks add --board <id-or-slug> --list <id> --group <id> [--title <text>] [--status <id>] [--priority <id>] [release selector] [--emoji <text>] [body input]
```

Create a task on a board.

- `--list <id>`: destination list id.
- `--group <id>`: required task group id.
- `--title <text>`: task title. Optional.
- `--status <id>`: workflow status id. Optional.
- `--priority <id>`: priority id. Optional.
- `--emoji <text>`: emoji prefix for the task.
- Release selectors are listed once in `Release selectors`.
- Body input variants are listed once in `Body input variants`.

### `tasks update`

Format:

```bash
hirotm tasks update <task-id> [--title <text>] [--status <id>] [--list <id>] [--group <id>] [--priority <id>] [release selector] [--color <css> | --clear-color] [--emoji <text> | --clear-emoji] [body input]
```

Update task fields. Pass at least one change.

- `--title <text>`: rename the task.
- `--status <id>`: change workflow status.
- `--list <id>`: move to another list.
- `--group <id>`: change task group.
- `--priority <id>`: change priority.
- `--color <css>` or `--clear-color`: set or clear card color.
- `--emoji <text>` or `--clear-emoji`: set or clear emoji.
- Release selectors are listed once in `Release selectors`.
- Body input variants are listed once in `Body input variants`.

### `tasks move`

Format:

```bash
hirotm tasks move --to-list <id> <task-id> [--to-status <id>] [--before-task <id> | --after-task <id> | --first | --last]
```

Move a task to another list and optionally change its status in the destination.

- `--to-list <id>`: destination list id.
- `--to-status <id>`: destination workflow status. Optional.
- Move position flags are listed once in `Move position flags`.

### `tasks delete`

Format:

```bash
hirotm tasks delete <task-id> [--dry-run] --yes
```

Move a task to Trash.

- `--dry-run`: preview the planned request without mutating data.

### `tasks restore`

Format:

```bash
hirotm tasks restore <task-id> --yes
```

Restore a trashed task.

### `tasks purge`

Format:

```bash
hirotm tasks purge <task-id> [--dry-run] --yes
```

Permanently delete a trashed task. This is irreversible.

- `--dry-run`: preview the planned request without mutating data.
