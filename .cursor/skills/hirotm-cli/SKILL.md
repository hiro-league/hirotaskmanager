---
name: hirotm-cli
description: Use the hirotm CLI to inspect and mutate TaskManager boards, tasks, lists, and releases, list workflow statuses, and run FTS search via `hirotm query search` through the local HTTP API. Use when working on TaskManager data, validating live board state, or when the user asks about boards, tasks, lists, releases, statuses, search, or the local server.
---

# hirotm CLI

**Repository dev (`npm run dev`, API on 3002):** append **`--profile dev`** to each command (for example **`hirotm boards list --profile dev`**), or set **`TASKMANAGER_PROFILE=dev`** in the environment. Omit for an installed app on port 3001.

**Output:** global **`--format ndjson|human`** (default **`ndjson`**). **`ndjson`:** list/search reads → one JSON object per line; other successes → one compact JSON line; errors → JSON on stderr. **`human`:** list reads and **`query search`** → fixed-width tables (with a short pagination footer where applicable); other successes → labeled lines; errors → plain text on stderr.

**Quiet lists:** **`-q` / `--quiet`** on those same list reads prints **one identifier per line** (plain text, not JSON); requires **`--format ndjson`**. Defaults: boards → **`slug`** then **`boardId`**; tasks and search hits → **`taskId`**; releases → **`releaseId`**; **`lists list`** and trashed lists → **`listId`**; statuses → **`statusId`**. With **`--quiet`**, **`--fields`** allows **at most one** key.

**Field projection:** On list-style reads (`boards list`, `tasks list`, `lists list`, `releases list`, `query search`, `trash list …`, `statuses list`), pass **`--fields <keys>`** (comma-separated API keys) to shrink each row; unknown keys exit **2**. Requires **`--format ndjson`** (not compatible with human tables). **`boards describe`** does not use **`--fields`**; it uses **`--entities`** (`list`, `group`, `priority`, `release`, `status`, `meta`; order controls stdout); **ndjson** prints **`kind: "board"`**, then **`kind: "policy"`**, then row lines and optional **`kind: "meta"`**—not one nested JSON blob on stdout.

## When To Use

Use this skill when:

- The user asks about current boards, tasks, lists, releases, statuses, or task search results.
- You need live app state instead of reading source files.
- You need to confirm whether the local TaskManager server is running.
- You are considering touching `data/taskmanager.db` directly.

## Core Rules

- Use `hirotm` instead of direct SQLite access for normal TaskManager operations (reads and writes).
- For agent-driven writes, include `--client-name "Cursor Agent"` so notifications identify the writer clearly.
- Prefer CLI JSON output as the source of truth for current board/task data.
- Do not write SQL or edit database files unless the user explicitly asks for database-level work.
- If a query command fails with `Server not reachable`, run the exact `hirotm server start ...` hint from the error output and retry (append `--profile dev` when using the dev server on 3002).

## Common Commands

```bash
hirotm server status
hirotm boards list
hirotm boards describe <id-or-slug> [--entities list,group,priority,release,status,meta]
hirotm boards add [name] [--emoji <text>] --client-name "Cursor Agent"
hirotm lists list --board <id-or-slug> [--limit <n>] [--offset <n>] [--page-all] [--fields <keys>]
hirotm lists add --board <id-or-slug> [name] [--emoji <text>] --client-name "Cursor Agent"
hirotm tasks add --board <id-or-slug> --list <id> --group <id> [--priority <id>] [--release <name>|none|--release-id <id>] [--title ...] [--body|--body-file|--body-stdin ...] --client-name "Cursor Agent"
hirotm tasks update --board <id-or-slug> [--title ...] [--list ...] [--status ...] [--release ...] [--body|--body-file|--body-stdin ...] <task-id> [--client-name "Cursor Agent"]
hirotm tasks list --board <id-or-slug> [--release-id <id> ...] [--untagged]
hirotm releases list --board <id-or-slug>
hirotm releases add --board <id-or-slug> --name <text>
hirotm tasks move --board <id-or-slug> --to-list <id> [--to-status <id>] [--first|--last|--before-task <id>|--after-task <id>] <task-id> [--client-name "Cursor Agent"]
hirotm statuses list
hirotm query search "<query>"
hirotm query search "<query>" --board <id-or-slug>
hirotm query search "<query>" --format human
hirotm trash list boards   # trashed boards (JSON)
hirotm trash list lists
hirotm trash list tasks
hirotm boards restore <id-or-slug> | hirotm boards purge <id-or-slug>
hirotm lists restore <list-id> | hirotm lists purge <list-id>
hirotm tasks restore <task-id> | hirotm tasks purge <task-id>
hirotm server start --background
hirotm server stop
```

## Usage Pattern

1. Check server availability with `hirotm server status` or a read command (with `--profile dev` when on repo dev).
2. If the server is not reachable, run the hinted `hirotm server start ...` command (append `--profile dev` for dev API).
3. Use read commands to inspect current state.
4. Prefer **`--format ndjson`** (default) when parsing output programmatically.
5. When performing writes as an automated agent, add `--client-name "Cursor Agent"` unless the user asked for a different writer label.

## Task priority

Every task has a priority row on the board (builtin **`none`**, value `0`, is the default). Omit `--priority` on `tasks add` for that default; pass `--priority <id>` with a row id from **`boards describe`** to set or change priority (including resetting to `none` on `tasks update`).

## Output Expectations

- Default **`ndjson`:** machine-readable JSON (line-oriented for lists); stderr errors are JSON with `error` and usually `code` (and sometimes `retryable`, `hint`, `status`, `url`).
- **`human`:** tables or labeled text on stdout; stderr errors are plain text (same detail keys, not JSON).
- Non-zero exit codes are meaningful: **2** usage, **3** not found, **4** forbidden, **5** conflict, **6** unreachable, **7** timeout, **9** bad request, **10** unauthenticated, **1** generic/internal. Repo: `docs/cli-error-handling.md`, `AGENTS.md`. Published `code` catalog: Hiro docs → Task Manager → Errors & exit codes (`/task-manager/cli/hirotm-error-codes`).

## Examples

```bash
hirotm boards list
hirotm boards describe my-project
hirotm tasks list --board my-project --page-all
hirotm statuses list
hirotm query search "fts5" --board my-project
hirotm server start --background --profile dev
```
