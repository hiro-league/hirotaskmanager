---
name: hirotm-cli
description: Use the hirotm CLI to inspect TaskManager boards, tasks, lists, statuses, and FTS search hits through the local HTTP API. Use when working on TaskManager data, validating live board state, or when the user asks about boards, tasks, lists, statuses, search, or the local server.
---

# hirotm CLI

## When To Use

Use this skill when:

- The user asks about current boards, tasks, lists, statuses, or task search results.
- You need live app state instead of reading source files.
- You need to confirm whether the local TaskManager server is running.
- You are considering touching `data/taskmanager.db` directly.

## Core Rules

- Use `hirotm` instead of direct SQLite access for normal TaskManager operations.
- Prefer CLI JSON output as the source of truth for current board/task data.
- Do not write SQL or edit database files unless the user explicitly asks for database-level work.
- If a query command fails with `Server not reachable`, run the exact `hirotm start ...` hint from the error output and retry.

## Common Commands

```bash
hirotm status
hirotm boards list
hirotm boards show <id-or-slug>
hirotm statuses list
hirotm search "<query>"
hirotm search "<query>" --board <id-or-slug>
hirotm search "<query>" --format table
hirotm start --background
```

## Usage Pattern

1. Check server availability with `hirotm status` or a read command.
2. If the server is not reachable, run the hinted `hirotm start ...` command.
3. Use read commands to inspect current state.
4. Keep outputs in JSON when reporting or making follow-up decisions.

## Output Expectations

- Read commands print valid JSON to `stdout`.
- Errors print JSON to `stderr`.
- Non-zero exit codes indicate failure.

## Examples

```bash
hirotm boards list
hirotm boards show my-project
hirotm statuses list
hirotm search "fts5" --board my-project
hirotm start --background --port 3002
```
