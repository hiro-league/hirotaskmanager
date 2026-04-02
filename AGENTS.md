# TaskManager Agent Guide

Use the `hirotm` CLI for TaskManager board, list, task, status, and **search** operations.

## Rules

- Prefer `hirotm` over direct database access for live app data.
- Do not modify `data/taskmanager.db` directly.
- Do not write raw SQL unless the user explicitly asks for database-level work.
- Treat CLI JSON output as the source of truth for current TaskManager state.
- If a query command reports `Server not reachable`, run the exact `hirotm start ...` command from the error hint before retrying.

## Common Commands

```bash
hirotm status
hirotm boards list
hirotm boards show <id-or-slug>
hirotm statuses list
hirotm search "<query>"                    # all boards; JSON hits
hirotm search "bug" --board <id-or-slug>   # one board
hirotm search "drag" --format table        # fixed-width table
hirotm start --background
```

## Notes

- The CLI talks to the local HTTP API; it should not bypass the server and touch SQLite directly.
- Read command errors are JSON on `stderr` with a non-zero exit code.
