# TaskManager Agent Guide

Use the `hirotm` CLI for TaskManager board, list, task, status, and **search** operations (including creating boards, lists, and tasks and updating or moving tasks).

## Rules

- You must use `hirotm` as your only channel to access TaskManager data.
- Never attempt accessing HTTP API, sqlite db or running taskmanager repo code directly to access or mutate TaskManager data.
- Do not modify `data/taskmanager.db` directly.
- Do not attempt to set CLI Access using the web app.
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
hirotm boards add "Sprint" [--emoji <text>]
hirotm lists add --board <id-or-slug> "Ready" [--emoji <text>]
hirotm tasks add --board <id-or-slug> --list <id> --group <id> [--title ...] [--body|--body-file|--body-stdin ...]
hirotm tasks update --board <id-or-slug> <task-id> [field flags...]
hirotm tasks move --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>]
hirotm start --background
```

## Notes

- The CLI talks to the local HTTP API; it should not bypass the server and touch SQLite directly.
- Read command errors are JSON on `stderr` with a non-zero exit code.
