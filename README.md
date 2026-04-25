## What is Hiro Task Manager?

[![CI](https://github.com/hiro-league/hirotaskmanager/actions/workflows/ci.yml/badge.svg)](https://github.com/hiro-league/hirotaskmanager/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40hiroleague%2Ftaskmanager?label=npm&logo=npm)](https://www.npmjs.com/package/@hiroleague/taskmanager)
[![Docs](https://img.shields.io/badge/docs-hiroleague.com-8B5CF6)](https://docs.hiroleague.com/task-manager/get-started/quickstart)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Task management for solo builders with endless ideas and a talent for forgetting. Hiro Task Manager adds superpowers to your task lists with AI-agent access control.

**One minute demo** — [Open on YouTube](https://youtu.be/gtlFLINg2oQ)

<a href="https://youtu.be/gtlFLINg2oQ" title="Hiro Task Manager — one minute demo"><img src="assets/onminutedemo.jpg" width="400" alt="Hiro Task Manager one minute demo (YouTube)"></a>

## Releases

- 0.1.0 - First public release.

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


## Prerequisites

- You need either [bun](https://bun.sh/docs/installation) or [node.js](https://nodejs.org/en/download/), Not both.
- You can replace all bun/bunx commands below with npm/npx commands.

## Install (Local Setup)

Most users will use the Local Setup. If you're into setting the server up on a VPS, visit the [Advanced Setup](https://docs.hiroleague.com/task-manager/get-started/advanced-setup) page.

**One minute install** — [Open on YouTube](https://youtu.be/laf3w0J6IwU)

<a href="https://youtu.be/laf3w0J6IwU" title="Hiro Task Manager — one minute install"><img src="assets/oneminuteinstall.jpg" width="400" alt="Hiro Task Manager one minute install (YouTube)"></a>

**1. Install**

```bash
bun install -g @hiroleague/taskmanager
```

**2. First time setup - Interactive walkthrough**

```bash
hirotaskmanager     # Interactive: pick server option and accept all defaults
```

You will be prompted to set a passphrase for website login. A recovery key will be generated for you to recover your access if needed.

**3. Add AI Agent Skills**

```bash
bunx skills add hiro-league/hirotaskmanager        # from our repo
bunx skills add "$HOME/.taskmanager/skills"        # or from the local install
```

Install the skill globally to any AI Agent. Alternatively, install to specific projects or specific agents.


**4. Use the CLI**

```bash
hirotm boards list
```

Go to http://127.0.0.1:3001/ , login, create a board, give it CLI access and your AI Agents can now interact with it.

Need to run the server on VPS and access it from anywhere? Visit the [Advanced Setup](https://docs.hiroleague.com/task-manager/get-started/advanced-setup) page.

## Update

```bash
bun update -g @hiroleague/taskmanager
bunx skills update
```

## Installed Commands

This package installs two commands on your `PATH`:

| Binary | Use it for |
|--------|------------|
| **`hirotaskmanager`** | For Humans. First time setup, profile management and optional server lifecycle management |
| **`hirotm`** | For AI Agents. Start Server, Manage boards, lists and tasks|

## `hirotm` command index

Hiro Task Manager exposes `hirotm` for command-line and AI-agent-friendly control. AI Agents can create, update, and delete entities subject to per-board CLI access control.

| Command | Summary |
|---------|---------|
| **`server`** | Start, stop, and check the server status. |
| **`boards`** | List boards, inspect structure, manage board settings, and handle board trash operations. |
| **`lists`** | List, create, update, move, delete, restore, and purge lists on a board. |
| **`tasks`** | List, create, update, move, delete, restore, and purge tasks. |
| **`releases`** | List, show, create, update, delete, and set-default releases on a board. |
| **`statuses`** | List global workflow statuses. |
| **`query`** | Run full-text task search with `query search`. |
| **`trash`** | Read items currently in Trash. Restore and purge stay under their resource commands. |

## `hirotaskmanager` admin commands

| Command | Summary |
|---------|---------|
| - | First time wizard, pick a server or client mode |
| **`--setup-server`** | First time wizard for server mode |
| **`--setup-client`** | First time wizard for client mode |
| **`server start/stop/status`** | Manage the local server process. |
| **`server api-key generate/list/revoke`** | Mint, list, or revoke CLI API keys (when required) |
| **`profile use <name>`** | Set the default profile so commands run without `--profile` argument. |

## Contributing

Issues and pull requests are welcome.

## References

- [Hiro Task Manager Documentation](https://docs.hiroleague.com/task-manager)
- [Website](https://hiroleague.com/hiro-task-manager)
- [AI agent walkthrough (longer demo on YouTube)](https://youtu.be/NUSbLk1sZQU)
