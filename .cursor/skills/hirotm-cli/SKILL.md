---
name: hirotm-cli
description: Use the hirotm CLI to inspect and mutate TaskManager boards, tasks, lists, and releases, list workflow statuses, and run FTS search via `hirotm query search` through the local HTTP API. Use when working on TaskManager data, validating live board state, or when the user asks about boards, tasks, lists, releases, statuses, search, or the local server.
---

# hirotm CLI

**Repository dev (`npm run dev`, API on 3002):** add **`--profile dev`** immediately after `hirotm` on each invocation, or set **`TASKMANAGER_PROFILE=dev`** in the environment. Omit for an installed app on port 3001.

**JSON output:** stdout and stderr JSON are **compact (single-line)** by default. Use **`--pretty`** when you want indented JSON for reading in a terminal.

**Field projection:** On list-style reads (`boards list`, `tasks list`, `releases list|show`, `query search` JSON, `trash list …`, `statuses list`), pass **`--fields <keys>`** (comma-separated keys matching API JSON, e.g. **`boardId`**, **`taskId`**, **`releaseId`**, **`statusId`**) to shrink each row; unknown keys exit **2**. Not on **`boards show`** (deferred). Not with **`query search --format table`**.

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
- If a query command fails with `Server not reachable`, run the exact `hirotm server start ...` hint from the error output and retry (insert `--profile dev` after `hirotm` when using the dev server on 3002).

## Common Commands

```bash
hirotm server status
hirotm boards list
hirotm boards show <id-or-slug>
hirotm boards add --client-name "Cursor Agent" [name] [--emoji <text>]
hirotm lists add --client-name "Cursor Agent" --board <id-or-slug> [name] [--emoji <text>]
hirotm tasks add --client-name "Cursor Agent" --board <id-or-slug> --list <id> --group <id> [--priority <id>] [--release <name>|none|--release-id <id>] [--title ...] [--body|--body-file|--body-stdin ...]
hirotm tasks update --client-name "Cursor Agent" --board <id-or-slug> <task-id> [--title ...] [--list ...] [--status ...] [--release ...] [--body|--body-file|--body-stdin ...]
hirotm tasks list --board <id-or-slug> [--release-id <id> ...] [--untagged]
hirotm releases list --board <id-or-slug>
hirotm releases add --board <id-or-slug> --name <text>
hirotm tasks move --client-name "Cursor Agent" --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>]
hirotm statuses list
hirotm query search "<query>"
hirotm query search "<query>" --board <id-or-slug>
hirotm query search "<query>" --format table
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
2. If the server is not reachable, run the hinted `hirotm server start ...` command (add `--profile dev` for dev API).
3. Use read commands to inspect current state.
4. Keep outputs in JSON when reporting or making follow-up decisions.
5. When performing writes as an automated agent, add `--client-name "Cursor Agent"` unless the user asked for a different writer label.

## Task priority

Every task has a priority row on the board (builtin **`none`**, value `0`, is the default). Omit `--priority` on `tasks add` for that default; pass `--priority <id>` with a row id from `boards show` to set or change priority (including resetting to `none` on `tasks update`).

## Output Expectations

- Read commands print valid JSON to `stdout`.
- Errors print JSON to `stderr` with `error` and usually `code` (and sometimes `retryable`, `hint`, `status`, `url`).
- Non-zero exit codes are meaningful: **2** usage, **3** not found, **4** forbidden, **5** conflict, **6** unreachable, **7** timeout, **9** bad request, **10** unauthenticated, **1** generic/internal. Repo: `docs/cli-error-handling.md`, `AGENTS.md`. Published `code` catalog: Hiro docs → Task Manager → Errors & exit codes (`/task-manager/cli/hirotm-error-codes`).

## Examples

```bash
hirotm boards list
hirotm boards show my-project
hirotm statuses list
hirotm query search "fts5" --board my-project
hirotm --profile dev server start --background
```
