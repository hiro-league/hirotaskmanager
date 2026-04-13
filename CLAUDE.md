# TaskManager Agent Guide

Use `hirotm` as the **only** channel to read or mutate TaskManager data.

## Mandatory flags

| Context | Flag | When |
|---------|------|------|
| Dev server (`npm run dev`, port 3002) | `--profile dev` | Every command (or `export TASKMANAGER_PROFILE=dev` once) |
| Agent writes (add / update / move / delete) | `--client-name "Cursor Agent"` | Every mutating command |
| Script / agent deletes & purges | `--yes` | Non-interactive confirmation |

## Rules

- Never access the HTTP API, SQLite DB, or run repo code directly for TaskManager data.
- Never modify `data/taskmanager.db` directly.
- Never change CLI access policy (the human configures it in the web app).
- Treat CLI JSON output as the source of truth for current state.
- Do not write raw SQL unless the user explicitly asks.

## Server recovery

If a command fails with **exit 6** (server unreachable), run the exact `hirotm server start ...` command from the `hint` field in stderr JSON, then retry.

---

## Command reference

Global options on every command: `--format ndjson|human` (default `ndjson`), `-q`/`--quiet`, `--profile <name>`, `--client-name <name>`.

### server

| Command | Synopsis |
|---------|----------|
| `server start` | `hirotm server start [--background] [--data-dir <path>]` |
| `server status` | `hirotm server status` |
| `server stop` | `hirotm server stop` |

### boards

| Command | Synopsis |
|---------|----------|
| `boards list` | `hirotm boards list [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]` |
| `boards describe` | `hirotm boards describe <id-or-slug> [--entities list,group,priority,release,status,meta]` |
| `boards add` | `hirotm boards add [name] [--emoji <text>] [--description <text>\|--description-file <path>\|--description-stdin]` |
| `boards update` | `hirotm boards update <id-or-slug> [--name <text>] [--emoji <text>\|--clear-emoji] [--description <text>\|--description-file\|--description-stdin\|--clear-description] [--board-color <preset>\|--clear-board-color]` |
| `boards delete` | `hirotm boards delete <id-or-slug> --yes` |
| `boards restore` | `hirotm boards restore <id-or-slug> --yes` |
| `boards purge` | `hirotm boards purge <id-or-slug> --yes` |
| `boards configure groups` | `hirotm boards configure groups <id-or-slug> --json <text>\|--file <path>\|--stdin --yes` |
| `boards configure priorities` | `hirotm boards configure priorities <id-or-slug> --json <text>\|--file <path>\|--stdin --yes` |

### lists

| Command | Synopsis |
|---------|----------|
| `lists list` | `hirotm lists list --board <id-or-slug> [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]` |
| `lists add` | `hirotm lists add --board <id-or-slug> [name] [--emoji <text>]` |
| `lists update` | `hirotm lists update --board <id-or-slug> <list-id> [--name <text>] [--color <css>\|--clear-color] [--emoji <text>\|--clear-emoji]` |
| `lists move` | `hirotm lists move --board <id-or-slug> <list-id> [--before <id>\|--after <id>\|--first\|--last]` |
| `lists delete` | `hirotm lists delete --board <id-or-slug> <list-id> --yes` |
| `lists restore` | `hirotm lists restore <list-id> --yes` |
| `lists purge` | `hirotm lists purge <list-id> --yes` |

### tasks

| Command | Synopsis |
|---------|----------|
| `tasks list` | `hirotm tasks list --board <id-or-slug> [--list <id>] [--group <id>...] [--priority <id>...] [--status <id>...] [--release-id <id>...] [--untagged] [--date-mode opened\|closed\|any] [--from <yyyy-mm-dd>] [--to <yyyy-mm-dd>] [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]` |
| `tasks add` | `hirotm tasks add --board <id-or-slug> --list <id> --group <id> [--title <text>] [--status <id>] [--priority <id>] [--release <name>\|none\|--release-id <id>] [--emoji <text>] [--body <text>\|--body-file <path>\|--body-stdin]` |
| `tasks update` | `hirotm tasks update --board <id-or-slug> <task-id> [--title <text>] [--status <id>] [--list <id>] [--group <id>] [--priority <id>] [--release <name>\|none\|--release-id <id>] [--color <css>\|--clear-color] [--emoji <text>\|--clear-emoji] [--body <text>\|--body-file\|--body-stdin]` |
| `tasks move` | `hirotm tasks move --board <id-or-slug> --to-list <id> <task-id> [--to-status <id>] [--before-task <id>\|--after-task <id>\|--first\|--last]` |
| `tasks delete` | `hirotm tasks delete --board <id-or-slug> <task-id> --yes` |
| `tasks restore` | `hirotm tasks restore <task-id> --yes` |
| `tasks purge` | `hirotm tasks purge <task-id> --yes` |

Filter notes for `tasks list`: `--group`, `--priority`, `--status`, and `--release-id` accept repeatable values or comma-separated ids. Combine `--release-id` with `--untagged` for OR filtering.

### releases

| Command | Synopsis |
|---------|----------|
| `releases list` | `hirotm releases list --board <id-or-slug> [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]` |
| `releases show` | `hirotm releases show --board <id-or-slug> <release-id> [--fields <keys>]` |
| `releases add` | `hirotm releases add --board <id-or-slug> --name <text> [--color <css>] [--release-date <text>]` |
| `releases update` | `hirotm releases update --board <id-or-slug> <release-id> [--name <text>] [--color <css>\|--clear-color] [--release-date <text>\|--clear-release-date]` |
| `releases delete` | `hirotm releases delete --board <id-or-slug> <release-id> [--move-tasks-to <id>] --yes` |

### statuses

| Command | Synopsis |
|---------|----------|
| `statuses list` | `hirotm statuses list [--fields <keys>]` |

### query

| Command | Synopsis |
|---------|----------|
| `query search` | `hirotm query search "<query>" [--board <id-or-slug>] [--limit <n>] [--offset <n>] [--page-all] [--no-prefix] [--fields <keys>]` |

Default search limit is 20. Prefix matching is on by default (`drag` matches `dragging`); use `--no-prefix` for exact tokens.

### trash

| Command | Synopsis |
|---------|----------|
| `trash list boards` | `hirotm trash list boards [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]` |
| `trash list lists` | `hirotm trash list lists [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]` |
| `trash list tasks` | `hirotm trash list tasks [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]` |

Restore and purge commands live under their resource (`boards restore`, `lists restore`, `tasks restore`, etc.).

---

## Output & parsing

**Default `--format ndjson`:** list/search reads emit one JSON object per line on stdout. Other successes emit one compact JSON line. Errors are JSON on stderr.

**`--format human`:** list/search reads use fixed-width tables with a pagination footer. Other successes use labeled lines. Errors are plain text on stderr.

**`--quiet` (`-q`):** on list-style reads, prints one identifier per line (plain text, not JSON). Requires `--format ndjson`. Default identifiers: boards → `slug` (fallback `boardId`), tasks/search → `taskId`, releases → `releaseId`, lists → `listId`, statuses → `statusId`. With `--fields`, only one key is allowed.

**`--fields <keys>`:** comma-separated API JSON keys to project each row. Requires `--format ndjson`. Unknown keys exit 2. Not supported on `boards describe` (use `--entities` instead).

**`boards describe` output:** ndjson emits multiple lines: `kind: "board"`, `kind: "policy"`, then entity rows (`list`, `group`, `priority`, `release`, `status`) and optional `kind: "meta"`. The `--entities` flag controls which sections appear and their order.

---

## Error handling

Failures print JSON on stderr (with `--format ndjson`) containing `error`, `code`, and optionally `retryable` and `hint`.

| Exit | Meaning | Agent action |
|------|---------|--------------|
| **0** | Success | Parse stdout; continue. |
| **1** | Internal / DB / unmapped 5xx | If `retryable: true`, backoff and retry; else surface to user. |
| **2** | Invalid CLI arguments | Fix flags; do not retry unchanged. |
| **3** | Not found (404) | Refresh ids with `boards list` / `boards describe`; adjust target. |
| **4** | Forbidden (403) / policy | Do not retry; user must change CLI access policy. |
| **5** | Conflict (409) | Skip create or resolve duplicate. |
| **6** | Server unreachable | Run `hirotm server start ...` from `hint`; retry. |
| **7** | Timeout | Retry with delay. |
| **8** | Version mismatch (426) | Upgrade CLI or app per message. |
| **9** | Bad request (400/422) | Fix request params per `error`/`code`. |
| **10** | Unauthenticated (401) | Configure credentials when auth is implemented. |

Full error catalog: `docs/cli-error-handling.md`.

---

## Domain notes

**Priority:** every board has `task_priority` rows (builtin `none` at value 0 is the default). Omit `--priority` on `tasks add` for the default. Use `boards describe` to read priority ids; pass `--priority <id>` to set or reset.

**Releases:** omit `--release` and `--release-id` on `tasks add` to let the server auto-assign when the board has a default release and CLI auto-assign enabled. Use `--release none` to explicitly leave untagged. Release CRUD requires `manageStructure` policy.

**Board colors:** preset values for `--board-color`: stone, cyan, azure, indigo, violet, rose, amber, emerald, coral, sage.
