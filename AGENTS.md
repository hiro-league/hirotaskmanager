# TaskManager Agent Guide

Use the `hirotm` CLI for TaskManager board, list, task, server, and **query search** operations (including creating boards, lists, and tasks and updating or moving tasks).

**Dev server (`npm run dev`, API port 3002):** append **`--profile dev`** to each command (e.g. `hirotm boards list --profile dev`), or set **`TASKMANAGER_PROFILE=dev`** once in the shell. Skip this when using an installed app on port 3001.

**Output:** global **`--format ndjson|human`** (default **`ndjson`**) controls all stdout/stderr shaping. **`ndjson`:** list and search reads emit **one JSON object per line**; other successes are **one compact JSON line**; errors are **JSON on stderr**. **`human`:** list reads use **fixed-width tables** (with a short footer for pagination); **`query search`** uses the same table style; single-object successes use **labeled lines**; errors are **plain text on stderr**. Styling follows **`NO_COLOR`** and TTY when relevant.

**Quiet list output:** global **`-q` / `--quiet`** on **list-style reads** prints **one plain-text value per line** on stdout (not JSON), for pipes and scripts. Requires **`--format ndjson`**. Default column per command: boards (and trashed boards) prefer **`slug`** then **`boardId`**; **`tasks list`**, search hits, and trashed tasks use **`taskId`**; **`releases list`** uses **`releaseId`**; **`lists list`** and **`trash list lists`** use **`listId`**; **`statuses list`** uses **`statusId`**. With **`--fields`**, only **one** key is allowed together with **`--quiet`** (that field per line).

**Field projection:** list-style read commands support **`--fields <keys>`** (comma-separated keys matching API JSON: e.g. **`boardId`**, **`taskId`**, **`listId`**, **`releaseId`**, **`statusId`**). Unknown names exit **2**. **`--fields` requires `--format ndjson`** (human tables cannot trim columns arbitrarily). **Human** list output includes a short footer with **`total`**, **`limit`**, **`offset`**; **ndjson** list output is only one JSON object per row (no envelope on stdout). Not supported on **`boards describe`** (use **`boards describe --entities …`** for a slimmer HTTP response; stdout is multi-line ndjson). For **`boards describe`** stdout: **`--format ndjson`** emits **multiple** lines—**`kind: "board"`** (identity and description only; the HTTP **`board`** object still includes **`cliPolicy`**, but stdout splits it out), next **`kind: "policy"`** (flat booleans), then **`list`**, **`group`**, **`priority`**, **`release`**, **`status`** rows and optional **`kind: "meta"`** in the same order as **`--entities`** (default when omitted: list → group → priority → release → status; **`meta`** is omitted unless requested). **`--format human`** mirrors that block order. **`--quiet`** requires **`--format ndjson`** if you use it with commands that support it; **`boards describe`** with **`--format human`** and **`--quiet`** exits **2**.

## Rules

- You must use `hirotm` as your only channel to access TaskManager data.
- When using `hirotm` for agent-driven writes, include `--client-name "Cursor Agent"` so notifications show the writer clearly.
- Never attempt accessing HTTP API, sqlite db or running taskmanager repo code directly to access or mutate TaskManager data.
- Do not modify `data/taskmanager.db` directly.
- Do not change CLI access policy by calling the HTTP API or editing the database directly unless the user explicitly asks; in normal use, the human configures CLI access in the web app after logging in.
- Do not write raw SQL unless the user explicitly asks for database-level work.
- Treat CLI JSON output as the source of truth for current TaskManager state.
- On **exit code 6** (`code` often `server_unreachable`) or when stderr says the server is not reachable, run the exact `hirotm server start ...` command from the `hint` before retrying (append `--profile dev` when the hint targets port 3002 / dev).

## Exit codes and stderr JSON

With **`--format ndjson`** (default), failures print **JSON on stderr** with at least `"error": "<message>"`. When present, use **`code`** (stable string) and **`retryable`** (boolean) together with **`$?`** for branching. In **`human`** format, stderr errors are plain text (same fields, not JSON). Maintainer-oriented contract: `docs/cli-error-handling.md`. Operator/agent-oriented catalog (exit codes, `code` values, examples): Hiro docs → Task Manager → [Errors & exit codes](/task-manager/cli/hirotm-error-codes).

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
hirotm boards describe <id-or-slug>              # structure + policy, no tasks (optional --entities)
hirotm statuses list
hirotm query search "<query>"                         # all boards; NDJSON hits (default)
hirotm query search "bug" --board <id-or-slug>       # one board
hirotm query search "drag" --format human           # fixed-width table
hirotm boards add "Sprint" [--emoji <text>] --client-name "Cursor Agent"
hirotm lists list --board <id-or-slug> [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]
hirotm lists add --board <id-or-slug> "Ready" [--emoji <text>] --client-name "Cursor Agent"
hirotm tasks add --board <id-or-slug> --list <id> --group <id> [--priority <id>] [--release <name>|none|--release-id <id>] [--title ...] [--body|--body-file|--body-stdin ...] --client-name "Cursor Agent"
hirotm tasks update --board <id-or-slug> [field flags...] <task-id> [--client-name "Cursor Agent"]  # e.g. --release none, --release <name>, --release-id <id>
hirotm tasks list --board <id-or-slug> [--release-id <id> ...] [--untagged]  # OR filter; repeat --release-id like --group
hirotm releases list --board <id-or-slug>
hirotm releases show --board <id-or-slug> <release-id>
hirotm releases add --board <id-or-slug> --name <text> [--color|--release-date ...]
hirotm releases update --board <id-or-slug> [--name ...] <release-id>
hirotm releases delete --board <id-or-slug> [--move-tasks-to <id>] <release-id> --yes   # scripts / agents
hirotm tasks move --board <id-or-slug> --to-list <id> [--to-status <id>] [--first|--last|--before-task <id>|--after-task <id>] <task-id> [--client-name "Cursor Agent"]
hirotm trash list boards                              # JSON: trashed boards
hirotm trash list lists | hirotm trash list tasks     # JSON: trashed lists/tasks
hirotm boards delete <id-or-slug> --yes               # move to Trash (omit --yes on TTY for prompt)
hirotm boards restore <id-or-slug> --yes
hirotm boards purge <id-or-slug> --yes                 # permanent delete from Trash
hirotm lists delete --board <id-or-slug> <list-id> --yes
hirotm lists restore <list-id> --yes | hirotm lists purge <list-id> --yes
hirotm tasks delete --board <id-or-slug> <task-id> --yes
hirotm tasks restore <task-id> --yes | hirotm tasks purge <task-id> --yes
hirotm server start --background
hirotm server stop                                    # background servers started by hirotm (pid file)
```

## Notes

- Task **priority** is always a board `task_priority` row: builtin **`none`** (value `0`, white) is the default when `--priority` is omitted on `tasks add`. Use **`boards describe`** to read **`priorityId`** / **`value`** / **`label`**; pass **`--priority <id>`** with the row id to set another level or to switch back to `none` on `tasks update`. Requires **`readBoard`** CLI policy (same as other board reads).
- **Releases:** omit both `--release` and `--release-id` on `tasks add` so the server can auto-assign when the board enables CLI auto-assign and a default release exists. Use `--release none` or `--release-id` with an explicit id to override. Release CRUD uses **`manageStructure`** (same as task groups), not a separate policy flag.
- The CLI talks to the local HTTP API; it should not bypass the server and touch SQLite directly.
- With default **`--format ndjson`**, errors are JSON on `stderr` with a non-zero exit code; prefer the `code` field when automating.
