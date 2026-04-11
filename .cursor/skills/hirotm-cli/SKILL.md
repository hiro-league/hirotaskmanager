---
name: hirotm-cli
description: Use the hirotm CLI to inspect and mutate TaskManager boards, tasks, lists, and releases, list workflow statuses, and run FTS search via `hirotm query search` through the local HTTP API. Use when working on TaskManager data, validating live board state, or when the user asks about boards, tasks, lists, releases, statuses, search, or the local server.
---

# hirotm CLI

Full command reference, rules, output format, and error handling: **`AGENTS.md`** (repo root).

## When to use

- The user asks about current boards, tasks, lists, releases, statuses, or search results.
- You need live app state instead of reading source files.
- You need to confirm whether the local TaskManager server is running.
- You are considering touching `data/taskmanager.db` directly — use `hirotm` instead.

## Quick start

1. Check server: `hirotm server status` (append `--profile dev` for repo dev on port 3002).
2. If unreachable, run the `hirotm server start ...` hint from stderr, then retry.
3. Read state: `hirotm boards list`, `hirotm boards describe <slug>`, `hirotm tasks list --board <slug>`.
4. Mutate: always include `--client-name "Cursor Agent"` and `--yes` (for deletes/purges).

## Examples

```bash
hirotm boards list
hirotm boards describe my-project
hirotm tasks list --board my-project --page-all
hirotm tasks add --board my-project --list 1 --group 1 --title "Fix bug" --client-name "Cursor Agent"
hirotm query search "drag" --board my-project
hirotm statuses list
hirotm server start --background --profile dev
```
