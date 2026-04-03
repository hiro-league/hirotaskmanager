# `hirotm` AI-First Write Command Spec

## Goal

Define the next CLI surface for AI agents to create and update boards, lists, and tasks without touching app internals or SQLite directly.

This spec is intentionally:

- AI-first
- non-interactive
- JSON-first
- simple to compose
- aligned with the existing HTTP API

## Recommendations

### Command style

Use simple Git-style nested commands:

```bash
hirotm boards add
hirotm lists add
hirotm tasks add
hirotm tasks update
hirotm tasks move
```

Why:

- matches the existing `hirotm boards list` and `hirotm boards show`
- is easier for agents to discover than `boards:create` or `tasks:patch`
- keeps resource + action consistent across reads and writes

### Task identification

For task and list write commands, always require `--board <id-or-slug>`.

Why:

- board IDs and slugs are already first-class in the API
- task IDs and list IDs are numeric and board-scoped in normal CLI usage
- it keeps lookups explicit and avoids ambiguous global task addressing

### Move semantics

Keep `tasks move` simple:

- move by updating `listId` and optionally `status`
- destination placement is always append-to-end of the target band
- no `before`, `after`, or exact index handling in v1

This matches current server behavior when a task changes list or status.

### Task update scope

`tasks update` should support any mutable task field the app exposes, not only the fields currently shown in the edit dialog.

Recommended mutable fields:

- `title`
- `body`
- `groupId`
- `priorityId`
- `status`
- `listId`
- `color`

`order` is intentionally excluded from the public CLI mutation surface in v1. Reordering remains separate from simple move semantics.

## Command Spec

### `hirotm boards add`

Create a board.

```bash
hirotm boards add [name]
```

Rules:

- `name` is optional
- omitted or blank name falls back to server default (`"New board"`)
- result should be a small JSON object, not the full board payload

Example:

```bash
hirotm boards add "Sprint Planning"
```

### `hirotm lists add`

Create a list on an existing board.

```bash
hirotm lists add --board <id-or-slug> [name]
```

Rules:

- `--board` is required
- `name` is optional
- omitted or blank name falls back to server default (`"New list"`)
- list is appended to the end of the board's list order

Example:

```bash
hirotm lists add --board sprint-planning "Ready"
```

### `hirotm tasks add`

Create a task on an existing board.

```bash
hirotm tasks add --board <id-or-slug> --list <id> --group <id> [options]
```

Options:

- `--title <text>` optional, defaults to `"Untitled"` when blank
- `--body <text>`
- `--body-file <path>`
- `--body-stdin`
- `--status <id>` optional, defaults to `"open"`
- `--priority <id>` optional
- `--no-priority` explicit null priority

Rules:

- exactly one of `--body`, `--body-file`, or `--body-stdin` may be used
- body content is plain UTF-8 text and may contain multiline Markdown
- task is appended to the end of the destination list/status band

Examples:

```bash
hirotm tasks add --board sprint-planning --list 12 --group 2 --title "Draft release notes"
```

```bash
hirotm tasks add --board sprint-planning --list 12 --group 2 --title "Write docs" --body-file notes.md
```

```bash
printf '# Summary\n\n- first\n- second\n' | hirotm tasks add --board sprint-planning --list 12 --group 2 --title "Publish summary" --body-stdin
```

### `hirotm tasks update`

Update one or more mutable fields on a task.

```bash
hirotm tasks update --board <id-or-slug> <task-id> [options]
```

Options:

- `--title <text>`
- `--body <text>`
- `--body-file <path>`
- `--body-stdin`
- `--group <id>`
- `--priority <id>`
- `--no-priority`
- `--status <id>`
- `--list <id>`
- `--color <css-color>`
- `--clear-color`

Rules:

- at least one update field is required
- exactly one body source may be supplied
- `--no-priority` writes `priorityId: null`
- `--clear-color` writes `color: null`
- use `tasks move` for the common "move this task" case, even though `tasks update` can also change `list` and `status`

Current UI parity:

- edit task fields: title, body, group, priority
- workflow actions: status changes such as complete, reopen, or set in-progress

Examples:

```bash
hirotm tasks update --board sprint-planning 42 --title "Finalize release notes" --priority 30
```

```bash
hirotm tasks update --board sprint-planning 42 --body-stdin --status in-progress
```

### `hirotm tasks move`

Move a task to another list and optionally another status.

```bash
hirotm tasks move --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>]
```

Rules:

- `--board`, `<task-id>`, and `--to-list` are required
- omitted `--to-status` keeps the current status
- moved task is appended to the end of the destination band
- this is a convenience command implemented via the same task patch route as `tasks update`

Examples:

```bash
hirotm tasks move --board sprint-planning 42 --to-list 15
```

```bash
hirotm tasks move --board sprint-planning 42 --to-list 15 --to-status closed
```

## Body Input Rules

Task body content should be agent-friendly and Markdown-friendly.

Support three body input modes:

1. `--body <text>` for short inline content
2. `--body-file <path>` for multiline Markdown from disk
3. `--body-stdin` for piped/generated content

Do not open an editor or any interactive prompt.

Validation:

- body input flags are mutually exclusive
- missing file paths should produce JSON errors
- stdin mode should read until EOF

## Output Shape

Write commands should return smaller normalized JSON objects instead of the full `Board` payload returned by the API.

Recommended envelope:

```json
{
  "ok": true,
  "boardId": 7,
  "boardSlug": "sprint-planning",
  "boardUpdatedAt": "2026-04-02T12:34:56.000Z",
  "entity": {
    "type": "task",
    "id": 42
  }
}
```

Recommended command-specific payloads:

- `boards add` → `entity` contains compact board fields
- `lists add` → `entity` contains compact list fields
- `tasks add` / `tasks update` / `tasks move` → `entity` contains the final task fields

Recommended task result shape:

```json
{
  "ok": true,
  "boardId": 7,
  "boardSlug": "sprint-planning",
  "boardUpdatedAt": "2026-04-02T12:34:56.000Z",
  "entity": {
    "type": "task",
    "id": 42,
    "listId": 15,
    "groupId": 2,
    "priorityId": 30,
    "status": "in-progress",
    "title": "Finalize release notes",
    "body": "# Notes\n\n- ready",
    "color": null,
    "createdAt": "2026-04-01T09:00:00.000Z",
    "updatedAt": "2026-04-02T12:34:56.000Z",
    "closedAt": null
  }
}
```

Implementation note:

- the server can continue returning full `Board` objects
- the CLI should derive the compact entity payload from the returned board before printing

## Error Rules

Errors remain JSON on `stderr` with non-zero exit codes.

Examples:

```json
{ "error": "Board not found", "board": "bad-slug" }
```

```json
{ "error": "Task not found", "board": "sprint-planning", "taskId": 999 }
```

```json
{ "error": "Exactly one body input source is allowed" }
```

```json
{ "error": "Server not reachable", "hint": "Run: hirotm start --background" }
```

## Safety Rules

- all mutations go through the existing HTTP API
- no raw SQLite access
- no interactive confirmation for normal write commands
- destructive commands remain separate from this spec
- defaults should be server-backed where possible so the CLI stays thin

## Implementation Notes

This spec aligns with the current API routes:

- `POST /api/boards`
- `POST /api/boards/:id/lists`
- `POST /api/boards/:id/tasks`
- `PATCH /api/boards/:id/tasks/:taskId`

`tasks move` should be a CLI convenience wrapper over the existing task patch route by sending:

- `listId`
- optional `status`

The current server already appends to the end of the destination band when list or status changes, so no new move API is required for v1.
