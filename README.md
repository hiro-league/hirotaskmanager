# What is Hiro Task Manager?

Task management for solo-preneurs with endless ideas and short memory loss. Hiro Task Manager adds super powers to your task lists with AI agents controlled access.

## Features

- **Boards & Lists**
  - **Create unlimited boards, lists, and tasks** - Spin up as much structure as you need with no arbitrary caps.
  - **Organize your tasks** - Use priorities, statuses, and groups to organize your tasks.
  - **Customize your view** - Board themes, custom task groups, custom statuses, emojis, and multiple board and task views.
- **Agentic workflow**
  - **Manage your lists and tasks** - Let your agent create your tasks and organize them in lists and boards.
  - **Control agent access** - Define exactly what your agent can see or change.
  - **Cursor IDE, Claude Code, GitHub Copilot** - Works out of the box with any AI agent that can execute CLI commands.
  - **Web notifications** - Stay informed about what your agents are doing on your boards.
- **Productivity**
  - **Keyboard shortcuts** - Developer first, desktop first; keyboard shortcuts for hardcore developers.
  - **Search and filter** - Filter by any field, full-text search.
  - **Instant statistics** - See task counts per list, per status.

## Why Hiro Task Manager?

- **Open source** - Use it, modify it, and extend it; docs and agentic skills help you customize.
- **Cross-platform** - Windows, Linux, and macOS.
- **Works with any AI agent** - Cursor IDE, Claude Code, GitHub Copilot, OpenClaw, and other tools that can drive the CLI.
- **Quick to start** - One-line installer, or install via AI agents.
- **Your data, your machine, your models** - Privacy stays under your control.

## Install

Preferred installed-user path:

```bash
bun install -g @hiroleague/taskmanager
hirotaskmanager
```

On first run:

1. `hirotaskmanager` runs launcher setup if needed
2. choose or accept the default port and data directory
3. open the app URL
4. set a passphrase in the browser
5. save the recovery key printed once in the terminal
*Make sure to save the recovery key in a secure location, preferably on a different device.*

Default installed profile paths:

- config: `%USERPROFILE%\.taskmanager\profiles\default\config.json`
- data: `%USERPROFILE%\.taskmanager\profiles\default\data\taskmanager.db`
- auth: `%USERPROFILE%\.taskmanager\profiles\default\auth\auth.json`

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

## Multiple Profiles

Hiro Task Manager supports multiple profiles if you are a developer and need to have different Task Manager Environments.

`hirotm` can also start the local server explicitly, including by profile:

```bash
hirotm server start --profile default --background
```

## Development

Repository development uses a separate dev profile and port:

```bash
npm install
npm run dev
```

Current defaults:

- web: `http://localhost:5173`
- API: `http://localhost:3002`
- dev data: `data/taskmanager.db` in the repo
- dev auth: `%USERPROFILE%\.taskmanager\profiles\dev\auth\auth.json`

## Notes

- There is no dev-only auth bypass.
- Auth setup and passphrase reset remain part of the web auth flow, not the CLI.

## Contributing

Issues and pull requests are welcome.