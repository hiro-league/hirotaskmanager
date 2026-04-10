# TaskManager Agent Guide

Use the `hirotm` CLI for TaskManager board, list, task, server, and **query search** operations (including creating boards, lists, and tasks and updating or moving tasks).

**Dev server (`npm run dev`, API port 3002):** add **`--profile dev`** right after `hirotm` on each command (e.g. `hirotm --profile dev boards list`), or set **`TASKMANAGER_PROFILE=dev`** once in the shell. Skip this when using an installed app on port 3001.

**JSON shape on stdout/stderr:** success and error payloads are **compact single-line JSON** by default (good for agents and pipes). For indented, human-readable JSON, pass **`--pretty`** (e.g. `hirotm --pretty boards list`).

**Field projection:** list-style read commands support **`--fields <keys>`** (comma-separated keys matching API JSON: e.g. **`boardId`**, **`taskId`**, **`listId`**, **`releaseId`**, **`statusId`**). Unknown names exit **2**. Paginated responses keep **`total`**, **`limit`**, **`offset`**; only **`items`** rows are trimmed. Not supported on **`boards show`** (pending redesign) or with **`query search --format table`**.

## Rules

- You must use `hirotm` as your only channel to access TaskManager data.
- When using `hirotm` for agent-driven writes, include `--client-name "Cursor Agent"` so notifications show the writer clearly.
- Never attempt accessing HTTP API, sqlite db or running taskmanager repo code directly to access or mutate TaskManager data.
- Do not modify `data/taskmanager.db` directly.
- Do not change CLI access policy by calling the HTTP API or editing the database directly unless the user explicitly asks; in normal use, the human configures CLI access in the web app after logging in.
- Do not write raw SQL unless the user explicitly asks for database-level work.
- Treat CLI JSON output as the source of truth for current TaskManager state.
- On **exit code 6** (`code` often `server_unreachable`) or when stderr says the server is not reachable, run the exact `hirotm server start ...` command from the `hint` before retrying (add `--profile dev` when the hint targets port 3002 / dev).

## Exit codes and stderr JSON

Failures print **JSON on stderr** with at least `"error": "<message>"`. When present, use **`code`** (stable string) and **`retryable`** (boolean) together with **`$?`** for branching. Maintainer-oriented contract: `docs/cli-error-handling.md`. Operator/agent-oriented catalog (exit codes, `code` values, examples): Hiro docs → Task Manager → [Errors & exit codes](/task-manager/cli/hirotm-error-codes).

| `$?` | Meaning (short) |
|------|------------------|
| **0** | Success |
| **1** | Generic / internal / unmapped HTTP (often **5xx**); `code` may be `internal_error`, `http_error`, etc. |
| **2** | Usage / invalid CLI arguments |
| **3** | Resource not found (e.g. HTTP **404**, or missing local file / release in list) |
| **4** | Forbidden / policy (**403**) |
| **5** | Conflict (**409**) |
| **6** | Server unreachable (connection failed; no HTTP response) |
| **7** | Timeout (API request or background server start wait) |
| **8** | Version mismatch (**426**, when used) |
| **9** | Bad request / validation (**400**, **422**) |
| **10** | Unauthenticated (**401**) |

## Common Commands

```bash
hirotm server status
hirotm boards list
hirotm boards show <id-or-slug>
hirotm statuses list
hirotm query search "<query>"                    # all boards; JSON hits
hirotm query search "bug" --board <id-or-slug>   # one board
hirotm query search "drag" --format table        # fixed-width table
hirotm boards add --client-name "Cursor Agent" "Sprint" [--emoji <text>]
hirotm lists add --client-name "Cursor Agent" --board <id-or-slug> "Ready" [--emoji <text>]
hirotm tasks add --client-name "Cursor Agent" --board <id-or-slug> --list <id> --group <id> [--priority <id>] [--release <name>|none|--release-id <id>] [--title ...] [--body|--body-file|--body-stdin ...]
hirotm tasks update --client-name "Cursor Agent" --board <id-or-slug> <task-id> [field flags...]  # e.g. --release none, --release <name>, --release-id <id>
hirotm tasks list --board <id-or-slug> [--release-id <id> ...] [--untagged]  # OR filter; repeat --release-id like --group
hirotm releases list --board <id-or-slug>
hirotm releases show --board <id-or-slug> <release-id>
hirotm releases add --board <id-or-slug> --name <text> [--color|--release-date ...]
hirotm releases update --board <id-or-slug> <release-id> [--name ...]
hirotm releases delete --board <id-or-slug> <release-id> [--move-tasks-to <id>]
hirotm tasks move --client-name "Cursor Agent" --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>]
hirotm trash list boards                        # JSON: trashed boards
hirotm trash list lists | hirotm trash list tasks    # JSON: trashed lists/tasks
hirotm boards restore <id-or-slug>       # restore board from Trash
hirotm boards purge <id-or-slug>           # permanently delete board in Trash
hirotm lists restore <list-id> | hirotm lists purge <list-id>
hirotm tasks restore <task-id> | hirotm tasks purge <task-id>
hirotm server start --background
hirotm server stop   # background servers started by hirotm (pid file)
```

## Notes

- Task **priority** is always a board `task_priority` row: builtin **`none`** (value `0`, white) is the default when `--priority` is omitted on `tasks add`. Use `--priority <id>` with the row id from `boards show` (or the API) to set another level or to switch back to `none` on `tasks update`.
- **Releases:** omit both `--release` and `--release-id` on `tasks add` so the server can auto-assign when the board enables CLI auto-assign and a default release exists. Use `--release none` or `--release-id` with an explicit id to override. Release CRUD uses **`manageStructure`** (same as task groups), not a separate policy flag.
- The CLI talks to the local HTTP API; it should not bypass the server and touch SQLite directly.
- Errors are JSON on `stderr` with a non-zero exit code; prefer the `code` field when automating.
