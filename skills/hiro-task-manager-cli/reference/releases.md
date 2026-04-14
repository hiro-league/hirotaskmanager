# Releases Commands

Use `hirotm releases` to inspect and manage board releases. Releases are board-level labels used to group tasks.

## Shared arguments

- `--board <id-or-slug>`: target board id or slug.
- `<release-id>`: numeric release id.
- `--yes`: use for non-interactive delete commands.

### Shared list/read flags

Used by `releases list` and partially by `releases show`.

- `--limit <n>`: page size.
- `--offset <n>`: skip rows.
- `--page-all`: merge all pages.
- `--fields <keys>`: project only selected fields.
- `releases list` supports global `--quiet` with `--format ndjson`.

### Shared update fields

Used by `releases add` and `releases update`.

- `--name <text>`: release name.
- `--color <css>` or `--clear-color`: set or clear release color.
- `--release-date <text>` or `--clear-release-date`: set or clear the release date.

## Commands

### `releases list`

Format:

```bash
hirotm releases list --board <id-or-slug> [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]
```

Use this to discover releases on a board before setting `--release` or `--release-id` on tasks.

### `releases show`

Format:

```bash
hirotm releases show --board <id-or-slug> <release-id> [--fields <keys>]
```

Inspect one release by id.

### `releases add`

Format:

```bash
hirotm releases add --board <id-or-slug> --name <text> [--color <css> | --clear-color] [--release-date <text> | --clear-release-date]
```

Create a release on a board.

- Shared update fields are listed once in `Shared update fields`.
- Release names must be unique per board.

### `releases update`

Format:

```bash
hirotm releases update --board <id-or-slug> <release-id> [--name <text>] [--color <css> | --clear-color] [--release-date <text> | --clear-release-date]
```

Update release fields. Pass at least one change.

- Shared update fields are listed once in `Shared update fields`.

### `releases delete`

Format:

```bash
hirotm releases delete --board <id-or-slug> <release-id> [--move-tasks-to <id>] --yes
```

Delete a release from a board.

- `--move-tasks-to <id>`: move tagged tasks to another release before deletion.
- If omitted, tasks on that release become untagged.
