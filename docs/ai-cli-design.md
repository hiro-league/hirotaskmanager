# hirotm CLI — Design Document

## 1. Overview

**hirotm** is a command-line interface for the TaskManager app. It serves two purposes:

1. **Server control** — start the API + web UI with a single command (`hirotm start`)
2. **Data operations** — read and mutate boards, lists, and tasks via structured JSON output

The primary consumer is **AI coding agents** (Cursor, Claude Code, Codex, etc.) running on the same machine. Human users interact with it for setup and testing.

### Architecture

```
hirotm CLI ──(HTTP)──► localhost:3001 ──► Hono API ──► SQLite
                           │
                       serves web UI
```

All query commands call the **existing HTTP API** on `localhost`. The CLI never touches SQLite directly. This avoids lock conflicts and ensures the CLI and web UI always see the same state.

The `hirotm start` command launches the same API + web server that `npm run dev` runs today, but from a globally-installed package — no repo or build environment needed.

---

## 2. Requirements

### Functional

| ID | Requirement |
|----|-------------|
| F1 | `hirotm start` launches the API server + web UI on a configurable port (default 3001) |
| F2 | `hirotm start --background` detaches the server process for AI agent use |
| F3 | `hirotm status` reports whether the server is running and on which port |
| F4 | `hirotm boards list` returns all boards as JSON |
| F5 | `hirotm boards show <id-or-slug>` returns a single board with its lists and tasks |
| F6 | `hirotm statuses list` returns the workflow statuses |
| F7 | `hirotm boards add`, `hirotm lists add`, `hirotm tasks add`, `hirotm tasks update`, and `hirotm tasks move` provide the AI-first write surface |
| F8 | All commands output JSON by default (AI-first) |
| F9 | All commands fail with a clear error and non-zero exit code if the server is unreachable |
| F10 | `hirotm help` and `--help` on every command |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NF1 | Works on Windows, macOS, and Linux |
| NF2 | Installable globally — available on PATH for AI agent sandboxes |
| NF3 | No interactive prompts during normal operation (AI agents can't answer prompts) |
| NF4 | Server starts once and stays running; no start/stop cycling |
| NF5 | Optional API key for localhost safety (prevents accidental cross-app calls) |
| NF6 | Multiline Markdown task bodies must be supported without opening an editor |

---

## 3. Decisions

### 3.1 CLI parser: Commander

**`commander`** — mature, TypeScript-friendly, first-class support for nested subcommands (`hirotm boards list`), auto-generated help, widely understood by AI tools.

Alternatives considered:
- `cac` — lighter but weaker subcommand support
- `yargs` — heavier, callback-style API
- Hand-rolled — not worth it given commander's simplicity

### 3.2 Command style: Git-style subcommands

```
hirotm <resource> <action> [args] [flags]
```

Examples:
```
hirotm start
hirotm start --background --port 4000
hirotm status
hirotm boards list
hirotm boards show my-project
hirotm boards add "Sprint Planning"
hirotm lists add --board sprint-planning "Ready"
hirotm tasks add --board sprint-planning --list 12 --group 2 --title "Draft notes"
hirotm tasks update --board sprint-planning 42 --priority 30
hirotm tasks move --board sprint-planning 42 --to-list 15 --to-status closed
hirotm statuses list
```

Rationale: natural for AI agents to discover and compose. Each resource is a command group with its own help text.

### 3.3 Server bundled in CLI

The globally-installed `hirotm` package includes:
- The CLI client (thin HTTP wrapper)
- The full server code (Hono API + SQLite migrations)
- The built web frontend (static `dist/` files)

This means `hirotm start` works on any machine without cloning the repo.

### 3.4 Bun as required runtime

The server depends on `bun:sqlite` (Bun's built-in SQLite driver). There is no Node.js-compatible replacement without adding a native dependency like `better-sqlite3`.

**Primary distribution**: `bun install -g hirotm` (requires Bun on target machine)

**Future option**: `bun build --compile` to produce standalone binaries (macOS-arm64, macOS-x64, linux-x64, win-x64) that embed the Bun runtime. This removes the Bun prerequisite but requires a build matrix. We defer this to a later phase.

### 3.5 Data directory

Reuses the existing `resolveDataDir()` logic from `src/server/db.ts`:

| Condition | Path |
|-----------|------|
| `DATA_DIR` env var set | `$DATA_DIR` |
| Production / global install | `~/.taskmanager/data/` |
| Development (repo) | `./data/` |

The install script will prompt the user to choose a data directory and persist it as `DATA_DIR` in a config file at `~/.hirotm/config`. This supports custom locations (repo folder, Google Drive-synced folder, etc.).

**Resolution order** (highest priority first):
1. `--data-dir` CLI flag
2. `DATA_DIR` environment variable
3. `~/.hirotm/config` → `data_dir` field
4. Platform default: `~/.taskmanager/data/`

### 3.6 Port configuration

**Resolution order** (highest priority first):
1. `--port` CLI flag
2. `PORT` environment variable
3. `~/.hirotm/config` → `port` field
4. Default: `3001`

Query commands discover the port through the same resolution order so they know which server to call.

### 3.7 Optional API key

When `API_KEY` is set (in env or config), the server requires it as a `Bearer` token on all `/api/*` requests. The CLI reads the same config and sends it automatically.

Phase 1 ships without auth enforcement. The config field is reserved for a future phase.

### 3.8 Output format

JSON by default on all commands. Read commands return the raw API payload. Write commands return compact normalized result objects derived from the API payload so agents do not need to diff full boards after every mutation. Errors are JSON objects written to `stderr`:

```json
{ "error": "Server not reachable at http://localhost:3001" }
```

Future phase adds `--format table` and `--format plain` for more read commands intended for human use.

### 3.9 Body input for tasks

Task writes must support multiline Markdown bodies without interactive editing.

Supported input modes:

- `--body <text>`
- `--body-file <path>`
- `--body-stdin`

Exactly one body source may be used on a single command.

### 3.10 Shebang

The CLI entry file uses:

```
#!/usr/bin/env bun
```

This tells the OS to run the script with Bun. It works on macOS/Linux. On Windows, Bun's global install handles `.ts` association, and the `bin` field in `package.json` does the wiring. No `.cmd` wrapper needed when installed via `bun install -g`.

---

## 4. Command Reference (Current + Proposed)

### `hirotm start`

Starts the API server and web UI.

```
hirotm start [--port <number>] [--background]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port, -p` | 3001 | Port to listen on |
| `--background, -b` | false | Detach server process, write PID to `~/.hirotm/server.pid` |

Foreground mode (default): blocks the terminal, logs to stdout. User presses Ctrl+C to stop.
Background mode: spawns a detached child process, prints the PID, exits immediately. AI agents use this mode.

### `hirotm status`

Reports server health.

```
hirotm status
```

Output when running:
```json
{ "running": true, "port": 3001, "pid": 12345, "url": "http://localhost:3001" }
```

Output when not running:
```json
{ "running": false }
```

Checks by: (1) reading PID file if it exists, (2) hitting `GET /api/health` on the configured port.

### `hirotm boards list`

Lists all boards.

```
hirotm boards list
```

Output: the JSON array from `GET /api/boards` (array of `BoardIndexEntry`).

```json
[
  { "id": 1, "slug": "my-project", "name": "My Project", "createdAt": "2026-04-01T..." },
  { "id": 2, "slug": "backlog", "name": "Backlog", "createdAt": "2026-03-15T..." }
]
```

### `hirotm boards show <id-or-slug>`

Shows a single board with all its lists, tasks, groups, and statuses.

```
hirotm boards show my-project
hirotm boards show 1
```

Output: the JSON object from `GET /api/boards/:id` (full `Board` model).

### `hirotm statuses list`

Lists workflow statuses.

```
hirotm statuses list
```

Output: the JSON array from `GET /api/statuses`.

```json
[
  { "id": "open", "label": "Open", "sortOrder": 0, "isClosed": false },
  { "id": "in-progress", "label": "In Progress", "sortOrder": 1, "isClosed": false },
  { "id": "closed", "label": "Closed", "sortOrder": 2, "isClosed": true }
]
```

### `hirotm boards add [name]`

Creates a new board.

```
hirotm boards add [name]
```

Notes:

- `name` is optional
- blank names fall back to the server default
- CLI prints a compact board result instead of the full board document

### `hirotm lists add --board <id-or-slug> [name]`

Creates a list on an existing board.

```
hirotm lists add --board <id-or-slug> [name]
```

Notes:

- `--board` is required
- `name` is optional
- new lists are appended to the end of the board's list order

### `hirotm tasks add --board <id-or-slug> --list <id> --group <id> [options]`

Creates a task on an existing board.

```
hirotm tasks add --board <id-or-slug> --list <id> --group <id> [--title <text>] [--status <id>] [--priority <id>] [--body <text> | --body-file <path> | --body-stdin]
```

Notes:

- `--board`, `--list`, and `--group` are required
- blank or omitted title falls back to `"Untitled"`
- exactly one body input source may be provided
- new tasks are appended to the end of the destination list/status band

### `hirotm tasks update --board <id-or-slug> <task-id> [options]`

Updates any mutable task field exposed by the app.

```
hirotm tasks update --board <id-or-slug> <task-id> [--title <text>] [--status <id>] [--list <id>] [--group <id>] [--priority <id> | --no-priority] [--color <css-color> | --clear-color] [--body <text> | --body-file <path> | --body-stdin]
```

Notes:

- at least one field must be supplied
- supports current edit-dialog fields plus other mutable task fields already supported by the API
- exactly one body input source may be provided

### `hirotm tasks move --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>]`

Moves a task using simple append semantics.

```
hirotm tasks move --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>]
```

Notes:

- destination order is always append-to-end
- omitted `--to-status` keeps the current status
- implemented as a convenience wrapper over task patching

---

## 5. Project Structure

```
src/
  cli/
    index.ts              ← entry point (shebang, commander setup)
    commands/
      start.ts            ← hirotm start
      status.ts           ← hirotm status
      boards.ts           ← hirotm boards list|show
      statuses.ts         ← hirotm statuses list
    lib/
      config.ts           ← read ~/.hirotm/config, resolve port/data-dir/api-key
      api-client.ts       ← fetch wrapper for localhost API calls
      output.ts           ← JSON output + error formatting to stdout/stderr
      process.ts          ← PID file management, background process spawning
  server/
    ...                   ← existing server code (unchanged)
  client/
    ...                   ← existing React app (unchanged)
  shared/
    ...                   ← existing shared types (unchanged)
```

### Config file: `~/.hirotm/config`

Simple key-value format (parsed as dotenv or JSON):

```json
{
  "port": 3001,
  "data_dir": "/Users/me/Google Drive/taskmanager-data",
  "api_key": ""
}
```

Created by `hirotm init` (future) or manually by the user.

---

## 6. Implementation roadmap

Phased work (status, completed vs upcoming) lives in **[ai-cli-plan.md](./ai-cli-plan.md)**.

---

## 7. Error Handling

All errors are JSON on stderr with a non-zero exit code.

| Scenario | Exit code | stderr |
|----------|-----------|--------|
| Server not running | 1 | `{ "error": "Server not reachable", "hint": "Run: hirotm start" }` |
| Board not found | 1 | `{ "error": "Board not found", "id": "bad-slug" }` |
| Task not found | 1 | `{ "error": "Task not found", "board": "my-project", "taskId": 999 }` |
| Invalid arguments | 2 | `{ "error": "Missing required argument: <id-or-slug>" }` |
| Invalid body input | 2 | `{ "error": "Exactly one body input source is allowed" }` |
| Server error (5xx) | 1 | `{ "error": "Server error", "status": 500, "detail": "..." }` |

---

## 8. Safety Rules

1. The CLI **never** accesses SQLite directly — all data flows through the HTTP API
2. No interactive prompts during command execution
3. Task bodies may be multiline Markdown, but must come from flags, file input, or stdin
4. API key support is reserved in config for future use
5. The CLI does not expose raw SQL, DB file paths, or migration commands

---

## 9. Development Workflow

During development (in this repo), the CLI is used via:

```bash
bun run src/cli/index.ts boards list
# or via the npm script:
bun run cli boards list
```

The dev server (`bun run dev`) and the CLI query commands can coexist — the CLI calls the same `localhost:3001` API that the dev server exposes.

For testing the global install:

```bash
bun install -g .
hirotm start --background
hirotm boards list
hirotm status
```
