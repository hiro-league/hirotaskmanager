# hirotm / AI CLI — Implementation plan

This document tracks **phased delivery** for the `hirotm` CLI described in [ai-cli-design.md](./ai-cli-design.md). Update phase status here as work lands.

### CLI vs UI-only surface

These are **not** planned for the CLI: they exist for the web app and are not needed for agent/CLI workflows.

- **View preferences** — layout (lanes vs stacked), status band weights, theme/canvas colors, background image, visible statuses / show counts as persisted presentation (`PATCH .../view-prefs`). (Board data still includes `visibleStatuses`; the CLI may read it, but we do not plan CLI commands to *edit* view prefs.)
- **Keyboard shortcuts** — entirely UI.

**Not the same as view prefs:** the board header’s **task filters** (active **group**, **priority**, **date range** with opened/closed/any mode) are **agent-relevant**. They now belong to the API-backed board task query design in [ai-cli-design.md §3.11](./ai-cli-design.md#311-board-scoped-task-filters) and are tracked in [Phase 4b](#phase-4b--api-backed-board-task-filtering--server-owned-move-semantics).

---

| Phase | Focus | Status |
|-------|--------|--------|
| [1](#phase-1--minimum-working-cli-read-only--server-control) | Minimum CLI: reads, search, server control | **Done** |
| [2](#phase-2--ai-agent-integration) | AI agent integration (rules, docs, actionable errors) | **Done** |
| [3](#phase-3--core-write-commands) | Core writes: boards, lists, tasks (+ emoji) | **Done** |
| [4a](#phase-4a--board-structure--extended-mutations) | Missing CLI commands that can ship on the current API | **Done** |
| [4b](#phase-4b--api-backed-board-task-filtering--server-owned-move-semantics) | API/UI cleanup for board filtering and ordering | **Done** |
| [5](#phase-5--mcp-server) | MCP server wrapping the HTTP API | Not started |
| [6](#phase-6--distribution--polish) | Distribution and polish | Partial (see phase) |
| [Future B](#future--advanced-search-server-side-filtering) | Advanced FTS search + server-side filters | Blocked — **no API yet** |

---

## Phase 1 — Minimum Working CLI (read-only + server control)

**Status: Done**

**Goal**: Install globally, start the server, query boards and statuses, search tasks (FTS).

| Step | Task | Details |
|------|------|---------|
| 1.1 | Add `commander` dependency | `bun add commander` |
| 1.2 | Create `src/cli/index.ts` | Shebang, program definition, wire subcommands |
| 1.3 | Implement `src/cli/lib/config.ts` | Read `~/.hirotm/config`, merge with env vars and flags |
| 1.4 | Implement `src/cli/lib/api-client.ts` | `fetchApi(path)` → calls `http://localhost:{port}/api/{path}`, returns parsed JSON, handles connection refused |
| 1.5 | Implement `src/cli/lib/output.ts` | `printJson(data)` to stdout, `printError(msg)` to stderr, set exit code |
| 1.6 | Implement `hirotm boards list` | Calls `GET /api/boards`, prints result |
| 1.7 | ~~`hirotm boards show`~~ **removed** | Use `boards describe` + `tasks list --board` (and `--page-all`); `GET /api/boards/:id` remains for the web app |
| 1.8 | Implement `hirotm statuses list` | Calls `GET /api/statuses`, prints result |
| 1.9 | Implement `hirotm start` | Foreground: runs existing server startup. Background: `Bun.spawn` detached child |
| 1.10 | Implement `hirotm status` | Check PID file + health endpoint |
| 1.11 | Add `bin` field to `package.json` | `"hirotm": "./src/cli/index.ts"` |
| 1.12 | Add `cli` script to `package.json` | `"cli": "bun run src/cli/index.ts"` for dev use |
| 1.13 | Test global install | `bun install -g .` from repo, verify `hirotm` works from any directory |
| 1.14 | Implement `hirotm search` | `GET /api/search` (FTS5); query arg; `--board`, `--limit`, `--format json\|table`, `--no-prefix` |

**Steps 1.1–1.5** are foundation. **Steps 1.6–1.8** are board/status queries. **Step 1.14** is task search. **Steps 1.9–1.10** are server control. **Steps 1.11–1.13** are packaging.

Implementation note: subcommands live in `src/cli/index.ts` rather than separate files under `src/cli/commands/`; behavior matches the design.

---

## Phase 2 — AI Agent Integration

**Status: Done**

| Task | Details |
|------|---------|
| Cursor agent rule | `.cursor/rules/hirotm.mdc` — instructs agents to use CLI for task/board operations |
| Cursor skill | `.cursor/skills/hirotm-cli/SKILL.md` — commands, output format, usage |
| AGENTS.md | Root-level file: CLI usage, do-not-modify-DB rule |
| `hirotm start` auto-detect | API client surfaces unreachable-server errors with a copy/pasteable `hirotm start --background` hint (see `src/cli/lib/api-client.ts`) |

---

## Phase 3 — Core Write Commands

**Status: Done**

First AI-first mutation commands: simple, non-interactive, JSON-first. Align with [ai-cli.md](./ai-cli.md); extend that spec with **emoji** wherever the API accepts it (validated via `parseEmojiField` / `MAX_EMOJI_GRAPHEMES` — see `src/shared/emojiField.ts`).

| Command | HTTP call | Notes |
|---------|-----------|-------|
| `hirotm boards add [name]` | `POST /api/boards` | Optional `--emoji`; compact board result |
| `hirotm lists add --board <id-or-slug> [name]` | `POST /api/boards/:id/lists` | Optional `--emoji`; append new list to end |
| `hirotm tasks add --board <id-or-slug> --list <id> --group <id> ...` | `POST /api/boards/:id/tasks` | Optional `--emoji`; body via `--body`, `--body-file`, or `--body-stdin` |
| `hirotm tasks update --board <id-or-slug> <task-id> ...` | `PATCH /api/boards/:id/tasks/:taskId` | Includes `emoji` with other mutable task fields |
| `hirotm tasks move --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>]` | `PATCH /api/boards/:id/tasks/:taskId` | Initial Phase 3 surface; upgraded in Phase 4b to a dedicated move endpoint |

Write commands should return compact normalized JSON objects, not full board payloads.

---

## Phase 4a — Board Structure & Extended Mutations

**Status: Done** (canonical implementation details: [ai-cli-design.md §3.12, §4](./ai-cli-design.md#312-replace-style-board-structure-commands))

Covers the remaining **CLI commands** that can ship on top of the **current** server API: board structure and board/task-list lifecycle. It intentionally excludes API-backed board task filtering and move/reorder API cleanup, which are split into [Phase 4b](#phase-4b--api-backed-board-task-filtering--server-owned-move-semantics).

| Implemented CLI command | HTTP / implementation basis | Notes |
|------------------------|-----------------------------|-------|
| `hirotm boards update <id-or-slug>` | `PATCH /api/boards/:id` | Updates board metadata such as name, emoji, description, `boardColor` (CLI policy: web app Edit board only) |
| `hirotm boards delete <id-or-slug>` | `DELETE /api/boards/:id` | Deletes board |
| `hirotm boards groups <id-or-slug>` | `PATCH /api/boards/:id/groups` | Replace-style set sync; CLI/help requirements and remap behavior live in design §3.12 |
| `hirotm boards priorities <id-or-slug>` | `PATCH /api/boards/:id/priorities` | Replace-style set sync with built-in restrictions; see design §3.12 |
| `hirotm lists update --board <id-or-slug> <list-id>` | `PATCH /api/boards/:id/lists/:listId` | Updates list `name`, `color`, `emoji` |
| `hirotm lists delete --board <id-or-slug> <list-id>` | `DELETE /api/boards/:id/lists/:listId` | Deletes list |
| `hirotm tasks delete --board <id-or-slug> <task-id>` | `DELETE /api/boards/:id/tasks/:taskId` | Deletes task |

All Phase 4a items above ship on the **current** server API.

Exact command names and flag shapes now live in [ai-cli.md](./ai-cli.md).

---

## Phase 4b — API-backed Board Task Filtering + Server-owned Move Semantics

**Status: Done** (design: [ai-cli-design.md §3.11, §3.13, §4](./ai-cli-design.md#311-board-scoped-task-filters))

This phase moves two areas out of CLI-side compensation and into cleaner API-backed behavior:

- board-scoped task filtering via a dedicated board task query
- list/task ordering via server-owned relative move semantics

| Area | Implemented work | Notes |
|------|------------------|-------|
| Board tasks API | Added filtered board task endpoint | `GET /api/boards/:id/tasks` supports `listId`, `groupId`, repeated `priorityId`, repeated `status`, `dateMode`, `from`, `to` |
| CLI | Added `hirotm boards tasks <id-or-slug> ...` | Dedicated filtered task query; full task sets via `tasks list --board` |
| UI / shared semantics | Kept board header filtering aligned with the shared predicate | Server filtering reuses the shared board filter semantics instead of inventing a second ruleset |
| Lists API | Added relative move endpoint for lists | `PUT /api/boards/:id/lists/move` with `listId` + `beforeListId` / `afterListId` / `position` |
| Tasks API | Added relative move endpoint for tasks | `PUT /api/boards/:id/tasks/move` accepts task destination and relative placement; UI drag flows provide visible-order context when filters hide some tasks |
| CLI | Added `hirotm lists move ...` and upgraded `hirotm tasks move ...` to use the new move endpoints | CLI no longer computes full order arrays for ordinary move operations |
| UI | Updated drag/drop ordering flows to use the new move endpoints | List and task board interactions now reconcile from server-owned move responses |

---

## Phase 5 — MCP Server

**Status: Not started**

Wrap the same HTTP API calls in an MCP tool server for native Cursor/Claude integration. Parity with **Phase 1** includes search.

| Tool | Maps to |
|------|---------|
| `list_boards` | `GET /api/boards` |
| `show_board` | `GET /api/boards/:id` |
| `list_statuses` | `GET /api/statuses` |
| `search_tasks` (or `search`) | `GET /api/search` |
| `create_task` | `POST /api/boards/:id/tasks` |
| `update_task` | `PATCH /api/boards/:id/tasks/:taskId` |
| … | … (extend as Phases 3–4b ship) |

MCP server runs as a stdio process configured in `.cursor/mcp.json`. It internally calls the same localhost HTTP API as the CLI.

---

## Phase 6 — Distribution & Polish

**Status: Partial**

| Task | Details | Status |
|------|---------|--------|
| Compiled binaries | `bun build --compile` for macOS-arm64, macOS-x64, linux-x64, win-x64 | Not done |
| Install script | `curl -fsSL https://...install.sh \| sh` — downloads correct binary, places on PATH | Not done |
| `hirotm init` | Interactive first-run: choose data directory, set port, generate config | Not done |
| `--format table` | Human-readable table output for **all** query commands | Partial: `hirotm search` supports `--format json\|table` |
| npm publish | Publish to npm for `bun install -g hirotm` without cloning the repo | Not done |

---

## Future — Advanced search (server-side filtering)

**Status: Blocked — no API yet**

A later iteration of **global** `hirotm search` / `GET /api/search` could filter server-side by **task group**, **priority**, **status**, date ranges, etc., in addition to FTS text. That requires **new HTTP API design and implementation**; the current search is FTS with optional `--board` scope only. Track server work separately; add CLI/MCP once the API exists.

This is distinct from Phase 4b board-scoped filters: board filters apply within one board via a dedicated board task API, while advanced search filtering needs broader **server-side search** semantics across boards.

---

## See also

- [ai-cli-design.md](./ai-cli-design.md) — full CLI design (requirements, decisions, command reference, errors, safety)
- [ai-cli.md](./ai-cli.md) — write-command spec for Phases 3–4b
