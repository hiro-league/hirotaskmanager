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
hirotm boards update
hirotm boards delete
hirotm boards restore
hirotm boards purge
hirotm boards groups
hirotm boards priorities
hirotm boards tasks
hirotm lists add
hirotm lists update
hirotm lists delete
hirotm lists restore
hirotm lists purge
hirotm lists move
hirotm tasks add
hirotm tasks update
hirotm tasks delete
hirotm tasks restore
hirotm tasks purge
hirotm tasks move
hirotm trash boards
hirotm trash lists
hirotm trash tasks
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

Keep move commands server-owned:

- `lists move` and `tasks move` call dedicated move endpoints
- placement uses `--before` / `--after` / `--first` / `--last` style flags
- the CLI does not assemble full ordered id arrays for normal move operations
- `tasks update` still changes task fields, but `tasks move` is the canonical ordering surface

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

`order` remains excluded from the public CLI mutation surface; ordering belongs to the dedicated move endpoints instead of generic patch commands.

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

### `hirotm boards update`

Patch board metadata.

```bash
hirotm boards update <id-or-slug> [options]
```

Options:

- `--name <text>`
- `--emoji <text>`
- `--clear-emoji`
- `--description <text>`
- `--description-file <path>`
- `--description-stdin`
- `--clear-description`
- `--cli-access <none|read|read_write>`
- `--board-color <stone|cyan|azure|indigo|violet|rose|amber|emerald|coral|sage>`
- `--clear-board-color`

Rules:

- at least one update field is required
- exactly one description source may be supplied
- `--clear-description` writes `description: null`
- `--clear-emoji` writes `emoji: null`
- `--clear-board-color` writes `boardColor: null`

### `hirotm boards delete`

Move a board to Trash (soft delete). Use `boards restore` / `boards purge` for Trash.

```bash
hirotm boards delete <id-or-slug>
```

Rules:

- `<id-or-slug>` is required
- no interactive confirmation
- output is a compact trash-move result (`trashed`), not a board payload

### `hirotm boards restore`

Restore a board from Trash.

```bash
hirotm boards restore <id-or-slug>
```

Rules:

- `<id-or-slug>` is a numeric board id, or a slug as shown in `hirotm trash boards`
- output is the same success envelope as `boards update` (compact board entity)

### `hirotm boards purge`

Permanently delete a board from Trash.

```bash
hirotm boards purge <id-or-slug>
```

Rules:

- same id/slug resolution as `boards restore`
- output is `{ "ok": true, "purged": { "type": "board", "id": <n> } }`

### `hirotm boards groups`

Replace the board task groups definition set from JSON.

```bash
hirotm boards groups <id-or-slug> (--json <text> | --file <path> | --stdin)
```

Rules:

- exactly one JSON source is required
- input may be either:
  - a raw JSON array of groups, or
  - an object with `taskGroups`
- the CLI forwards the definition set to the existing replace-style API

### `hirotm boards priorities`

Replace the board task priorities definition set from JSON.

```bash
hirotm boards priorities <id-or-slug> (--json <text> | --file <path> | --stdin)
```

Rules:

- exactly one JSON source is required
- input may be either:
  - a raw JSON array of priorities, or
  - an object with `taskPriorities`
- built-in/custom behavior follows the replace-style rules in the design doc

### `hirotm boards tasks`

List filtered tasks for one board without loading the full board payload.

```bash
hirotm boards tasks <id-or-slug> [--list <id>] [--group <id>] [--priority <id> ...] [--status <id> ...] [--date-mode <opened|closed|any>] [--from <yyyy-mm-dd>] [--to <yyyy-mm-dd>]
```

Rules:

- `<id-or-slug>` is required
- `--list` scopes to one list within the board
- `--priority` and `--status` may be repeated or passed as comma-separated values
- `--date-mode`, `--from`, and `--to` map directly to the board task query API
- output is a task array, not the full board payload

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

### `hirotm lists update`

Patch one list.

```bash
hirotm lists update --board <id-or-slug> <list-id> [options]
```

Options:

- `--name <text>`
- `--color <css-color>`
- `--clear-color`
- `--emoji <text>`
- `--clear-emoji`

Rules:

- `--board` and `<list-id>` are required
- at least one update field is required
- `--clear-color` writes `color: null`
- `--clear-emoji` writes `emoji: null`

### `hirotm lists delete`

Move one list to Trash.

```bash
hirotm lists delete --board <id-or-slug> <list-id>
```

Rules:

- `--board` and `<list-id>` are required
- output is a compact trash-move result (`trashed`)

### `hirotm lists restore`

Restore a list from Trash (numeric list id only; see `hirotm trash lists`).

```bash
hirotm lists restore <list-id>
```

### `hirotm lists purge`

Permanently delete a list from Trash.

```bash
hirotm lists purge <list-id>
```

### `hirotm lists move`

Move one list with server-owned relative placement.

```bash
hirotm lists move --board <id-or-slug> <list-id> [--before <list-id> | --after <list-id> | --first | --last]
```

Rules:

- `--board` and `<list-id>` are required
- use at most one of `--before`, `--after`, `--first`, or `--last`
- omitted placement defaults to the server move endpoint's last-position behavior
- output is a compact list result derived from the returned board

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

Move a task to another list and optionally another status with server-owned relative placement.

```bash
hirotm tasks move --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>] [--before-task <id> | --after-task <id> | --first | --last]
```

Rules:

- `--board`, `<task-id>`, and `--to-list` are required
- omitted `--to-status` keeps the current status
- use at most one of `--before-task`, `--after-task`, `--first`, or `--last`
- omitted placement falls back to the server move endpoint's last-position behavior
- this command uses the dedicated task move endpoint rather than generic task patching

Examples:

```bash
hirotm tasks move --board sprint-planning 42 --to-list 15
```

```bash
hirotm tasks move --board sprint-planning 42 --to-list 15 --to-status closed
```

```bash
hirotm tasks move --board sprint-planning 42 --to-list 15 --before-task 99
```

### `hirotm tasks delete`

Move one task to Trash.

```bash
hirotm tasks delete --board <id-or-slug> <task-id>
```

Rules:

- `--board` and `<task-id>` are required
- output is a compact trash-move result (`trashed`)

### `hirotm tasks restore`

Restore a task from Trash (numeric task id; see `hirotm trash tasks`).

```bash
hirotm tasks restore <task-id>
```

### `hirotm tasks purge`

Permanently delete a task from Trash.

```bash
hirotm tasks purge <task-id>
```

### `hirotm trash boards` / `lists` / `tasks`

JSON listing of Trash rows (same shapes as `GET /api/trash/...`).

```bash
hirotm trash boards
hirotm trash lists
hirotm trash tasks
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
- `boards update` / `boards groups` / `boards priorities` → `entity` contains compact board fields
- `lists add` → `entity` contains compact list fields
- `lists update` / `lists move` → `entity` contains compact list fields
- `tasks add` / `tasks update` / `tasks move` → `entity` contains the final task fields
- `boards delete` / `lists delete` / `tasks delete` → `trashed` contains the moved-to-trash target descriptor (`trashed: true`)

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

- the server can continue returning full `Board` objects for board-level replace/update commands
- the CLI may derive compact entity payloads from the returned board before printing
- list/task delete endpoints may return granular delete results directly

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

## Planned CLI coverage

The commands in **Command Spec** above are implemented. Additional scope is captured in the **design doc** (planned command tables plus the board-filter, replace, and move design sections): [ai-cli-design.md §3.11–§3.13, §4](./ai-cli-design.md#311-board-scoped-task-filters).

**Remaining planned coverage**:

**Phase 4a: implemented**

- `boards update`
- `boards delete`
- `boards groups`
- `boards priorities`
- `lists update`
- `lists delete`
- `tasks delete`

**Phase 4b: implemented**

- `boards tasks`
- `lists move`
- `tasks move` upgraded to the dedicated move endpoint surface

**Other gaps** (outside the Phase 4 / 4b bundle):

| Gap | Blocker / note |
|-----|----------------|
| Advanced FTS with server-side filters (group, priority, status, dates, …) | **No API yet** — [Future B](./ai-cli-plan.md#future--advanced-search-server-side-filtering) |
| `--format table` for `boards list`, `boards show`, `statuses list` | Only `search` supports table today — [Phase 6](./ai-cli-plan.md#phase-6--distribution--polish) |

Intentionally out-of-scope for the CLI (e.g. editing **view prefs**) remain omitted; see [ai-cli-plan.md — CLI vs UI-only](./ai-cli-plan.md#cli-vs-ui-only-surface).

## Implementation Notes

This spec aligns with the current implemented API routes:

- `POST /api/boards`
- `GET /api/boards/:id/tasks`
- `POST /api/boards/:id/lists`
- `PUT /api/boards/:id/lists/move`
- `POST /api/boards/:id/tasks`
- `PATCH /api/boards/:id/tasks/:taskId`
- `PUT /api/boards/:id/tasks/move`
