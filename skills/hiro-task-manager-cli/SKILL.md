---
name: hiro-task-manager-cli
description: Use this skill when working with Hiro Task Manager through the hirotm CLI to inspect or manage local server state, boards, lists, tasks, search results, and trash safely.
---

# Hiro Task Manager CLI

Use this skill when the user wants to work with Hiro Task Manager through the `hirotm` CLI.

## Use this skill for
- starting, stopping, or checking the Hiro local server
- listing boards, lists, tasks, and related Hiro entities
- searching for tasks before creating or modifying work
- creating, updating, moving, closing, deleting, restoring, or purging Hiro items
- automating Hiro safely from an AI coding agent

## Core rules
- Use `hirotm` for Hiro operations.
- Do not edit Hiro storage files or databases directly.
- Run commands from the intended workspace root.
- Inspect current state before making mutations.
- Prefer machine-readable output for agent workflows.
- Use `--client-name` on mutating commands so changes are attributable.
- Treat delete, purge, and structural changes as sensitive.

## Default operating workflow
1. Verify the workspace is the intended one.
2. Check whether the Hiro server is running.
3. Inspect the relevant state before changing anything.
4. Search before creating new work when duplicates are possible.
5. Perform the smallest safe mutation.
6. Show the resulting state after the change.

## Output conventions
Prefer machine-readable output when the result will be parsed or used by an agent.

**Use:**

```bash
--format ndjson
```

**Use --client-name on mutating commands:**

```bash
--client-name "Cursor Agent"
```

**Common startup commands**

```bash
hirotm server status
hirotm server start --background
hirotm server stop
```

**Common inspection commands**

```bash
hirotm boards list
hirotm lists list --board sprint
hirotm tasks list --board sprint
hirotm query search "login bug" --board sprint --limit 15
```

**Common mutation commands**

```bash
hirotm tasks add --board sprint --list 3 --title "Fix login redirect" --client-name "Cursor Agent"
hirotm tasks move --board sprint --to-list 4 101 --client-name "Cursor Agent"
hirotm tasks close --board sprint 101 --client-name "Cursor Agent"
hirotm tasks delete --board sprint 101 --yes --client-name "Cursor Agent"
hirotm tasks restore 101 --yes --client-name "Cursor Agent"
```

**Safety notes**

```bash
Prefer inspect-first workflows.
Search before create when overlap is likely.
Do not purge unless intent is clearly explicit.
Do not bypass the CLI by editing internal storage.
Respect permission and policy failures instead of working around them unsafely.
```

**References**

Use these files when you need more detail:

- CLI overview
- Command patterns
- Safety rules
- Examples