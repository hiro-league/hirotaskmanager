## What is Hiro Task Manager?

Task management for solo builders with endless ideas and bad memory like myself. Hiro Task Manager adds superpowers to your task lists with AI agents controlled access.

## Current Status

Hiro Task Manager is in active development and is not yet ready for production use. However it is stable enough to try out and get started with.

## Features

- **Boards & Lists**
  - **Create unlimited boards, lists, and tasks** - Spin up as much structure as you need with no arbitrary caps.
  - **Markdown and Mermaid support** - Use markdown to format your tasks and lists, encourage your AI Agents to build organized task descriptions and diagrams.
  - **Organize your tasks** - Use priorities, statuses, and groups to organize your tasks.
  - **Customize your view** - Board themes, custom task groups, custom statuses, emojis, and multiple board and task views.
- **Agentic workflow**
  - **Manage your lists and tasks** - Let your agents create your tasks and organize them in lists and boards.
  - **Control agent access** - Define exactly what your agent can see or change, using granular CLI Access Control.
  - **Cursor IDE, Claude Code, GitHub Copilot** - powered by `npx skills` to support dozens of AI Agents.
  - **Web notifications** - Stay informed about what your agents are doing on your boards.
- **Productivity**
  - **Keyboard shortcuts** - Developer first, desktop first; keyboard shortcuts for hardcore developers.
  - **Search and filter** - Filter by any field, full-text search.
  - **Instant statistics** - See task counts per list, per status.

## Why Hiro Task Manager?

- **Open source** - Use it, modify it, and extend it; docs and agentic skills help you customize.
- **Cross-platform** - Windows, Linux, and macOS.
- **Works with any AI agent** - supports dozens of AI Agents.
- **Quick to start** - One-line installer, or install via AI agents.
- **Detailed Documentation** - for developers and AI Agents.
- **Your data, your machine, your models** - Privacy stays under your control.

## Install

1. Bootstrap with bun or npm

```bash
bun install -g @hiroleague/taskmanager
```

2. Create default Profile and Start App

```bash
hirotaskmanager     # Follow on Screen Instructions
```

3. Add AI Agent Skills to your AI Agents

```bash
npx skills add hiro-league/hirotaskmanager # add skills from our repo
npx skills add "$HOME/.taskmanager/skills" # Or Alternatively add skills from local install
```

Follow npx skills instructions on screen to pick your AI Agents and whether to install the skills globally or in specific folders.

## Update New Verions

```bash
bun update -g @hiroleague/taskmanager
npx skills update
```

Follow [QuickStart](https://docs.hiroleague.com/task-manager/get-started/quickstart) Guide for more details.

## CLI

Hiro Task Manager exposes `hirotm` cli for command line and ai agent friendly control. You can use cli to manage your boards, lists, and tasks. AI Agents can create, update and delete all entities. Defensive and granular access control is built in.

| Command | Summary |
|---------|---------|
| **`server`** | Start, stop, and check the server status. |
| **`boards`** | List boards, inspect structure, manage board settings, and handle board trash operations. |
| **`lists`** | List, create, update, move, delete, restore, and purge lists on a board. |
| **`tasks`** | List, create, update, move, delete, restore, and purge tasks. |
| **`releases`** | List, show, create, update, and delete releases on a board. |
| **`statuses`** | List global workflow statuses. |
| **`query`** | Run full-text task search with `query search`. |
| **`trash`** | Read items currently in Trash. Restore and purge stay under their resource commands. |

## Contributing

Issues and pull requests are welcome.

## References

- [Hiro Task Manager Documentation](https://docs.hiroleague.com/task-manager)
- [Website](https://hiroleague.com/hiro-task-manager)
