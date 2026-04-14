---
name: hiro-task-manager-cli
description: Use this skill when working with Hiro Task Manager through the `hirotm` CLI to manage tasks, task lists and task boards.
---

# Hiro Task Manager CLI

Use this skill when the user wants to work with Hiro Task Manager through the `hirotm` CLI to manage tasks, task lists and task boards.

## Use this skill for
- Creating, updating and deleting tasks.
- Creating, updating and deleting task lists.
- Managing boards.
- listing, searching and filtering tasks, lists and boards.
- Managing Hiro Task Manager server, to be able to operate on tasks, lists and boards.
- Delete, purge or restore tasks, lists and boards.

## Default operating workflow
1. Navigate to intended workspace root.
2. Initially make sure Hiro Task Manager server is running.
3. Discover the boards, lists or tasks you need to work with.
4. Narrow down to the entity you need to work with, using search or list/filter.
5. Use (Identification) to identify yourself in all commands.
6. Perform the smallest safe mutation using all the available data, 
7. Show the resulting state after the change.

## Core rules
- Use `hirotm` cli command for all operations.
- use `--help` to get help on any command or sub command `boards --help`, `boards describe --help`.
- Run commands from the intended workspace root.
- Inspect current state before making mutations.
- Use `--client-name` on mutating commands so changes are attributable.
- Treat delete, purge, and structural changes as sensitive.

# Identification

Identify yourself in all commands with `--client-name <your-name>`. Your name should reflect the Agent Name, ex: Cursor Agent, Github Copilot Agent, Claude Code Agent, Open Code Agent.
If you are not sure, use a generic name "AI Agent"

## Installation

If command is not found, ask the user to [install](https://docs.hiroleague.com/task-manager/get-started/quick-start) it and configure it.

# Discovery

- use `boards list` to list all boards.
- use `boards describe <id-or-slug>` to describe all or some board details.
- use `tasks list --board <board-id-or-slug>` to list and filter tasks in a board.

# Finding/Adding/Updating Tasks

- When a user refers to an existing task, use `tasks list` with filers, or `search query` to find it.
- If convenient, use limit, offset, fields, or quiet options to manage and the output shape.
- When adding a task
  - use any available information such as priority, task group, release, etc...
  - Add proper title (80 characters max) and Emoji if relevant only.
  - use Organized Markdown description if the task body is detailed.
  - use mermaid diagrams if the task includes design diagrams or if the user requests it.
  - If linking to a larger documents in the workspace, make sure to use a proper link from the workspace root.

# Access

If you are not allowed to access an entity or perform an operation due to CLI Access Control, explain the situation and suggest the user to give you the necessary permissions. Never attempt to bypass the CLI Access Control.

# Server Operations

- Check Server Status with `server status`
- Start Server with `server start --background`
- Stop Server with `server stop`

## References

- [Installation Guide](https://docs.hiroleague.com/task-manager/get-started/quick-start)

**Safety notes**

- Prefer inspect-first workflows.
- Search before create when overlap is likely.
- Do not purge unless intent is clearly explicit.
- Do not bypass the CLI by any other means than the `hirotm` CLI.
- Respect permission and policy failures instead of working around them unsafely.

**References**

- [Online Documentation](https://docs.hiroleague.com/task-manager/get-started/quick-start)
