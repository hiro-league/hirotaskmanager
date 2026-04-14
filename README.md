# What is Hiro Task Manager?

Task management for solo builders with endless ideas and bad memory like myself. Hiro Task Manager adds superpowers to your task lists with AI agents controlled access.

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

Quickly bootstrap with bun or npm

```bash
bun install -g @hiroleague/taskmanager
```

Follow [QuickStart](https://docs.hiroleague.com/task-manager/get-started/quickstart) Guide for more details.

run `hirotaskmanager` to start the app. First run will guide you to create a default profile and set a passphrase.

use `npx skills hiroleague/taskmanager` to add it as a skill to your AI Agents.

## CLI

Hiro Task Manager exposes `hirotm` cli for command line and ai agent friendly control. You can use cli to manage your boards, lists, and tasks. AI Agents can create, update and delete all entities. Defensive and granular access control is built in.

Try hirotm help for a list of commands.

```bash
hirotm server status
hirotm boards
hirotm tasks
hirotm lists
hirotm query search
```

## Development

Repository development uses a separate dev profile and port:

```bash
npm install
npm run dev
```

## Contributing

Issues and pull requests are welcome.