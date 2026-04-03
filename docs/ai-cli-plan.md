# hirotm / AI CLI — Implementation plan

This document tracks **phased delivery** for the `hirotm` CLI described in [ai-cli-design.md](./ai-cli-design.md). Update phase status here as work lands.

### CLI vs UI-only surface

These are **not** planned for the CLI: they exist for the web app and are not needed for agent/CLI workflows.

- **View preferences** — layout (lanes vs stacked), status band weights, theme/canvas colors, background image, visible statuses / show counts as persisted presentation (`PATCH .../view-prefs`). (Board data still includes `visibleStatuses`; the CLI may read it, but we do not plan CLI commands to *edit* view prefs.)
- **Keyboard shortcuts** — entirely UI.

**Not the same as view prefs:** the board header’s **task filters** (active **group**, **priority**, **date range** with opened/closed/any mode) are **local UI state** today (see `preferences.ts`, `BoardTaskDateFilter.tsx`, filtering helpers in `boardStatusUtils.ts`). They are **agent-relevant** and belong in the CLI eventually — see [Future — Board-scoped task filters](#future--board-scoped-task-filters-cli-parity-with-header).

---

| Phase | Focus | Status |
|-------|--------|--------|
| [1](#phase-1--minimum-working-cli-read-only--server-control) | Minimum CLI: reads, search, server control | **Done** |
| [2](#phase-2--ai-agent-integration) | AI agent integration (rules, docs, actionable errors) | **Done** |
| [3](#phase-3--core-write-commands) | Core writes: boards, lists, tasks (+ emoji) | Not started |
| [4](#phase-4--board-structure--extended-mutations) | Task groups, priorities, deletes, reorder | Not started |
| [5](#phase-5--mcp-server) | MCP server wrapping the HTTP API | Not started |
| [6](#phase-6--distribution--polish) | Distribution and polish | Partial (see phase) |
| [Future A](#future--board-scoped-task-filters-cli-parity-with-header) | Board task filters (group, priority, status, date) | **Not in CLI yet** — no dedicated API; can filter after `GET /api/boards/:id` |
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
| 1.7 | Implement `hirotm boards show` | Calls `GET /api/boards/:id`, prints **full** board (all tasks); no filter flags — see [Future A](#future--board-scoped-task-filters-cli-parity-with-header) |
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

**Status: Not started**

First AI-first mutation commands: simple, non-interactive, JSON-first. Align with [ai-cli.md](./ai-cli.md); extend that spec with **emoji** wherever the API accepts it (validated via `parseEmojiField` / `MAX_EMOJI_GRAPHEMES` — see `src/shared/emojiField.ts`).

| Command | HTTP call | Notes |
|---------|-----------|-------|
| `hirotm boards add [name]` | `POST /api/boards` | Optional `--emoji`; compact board result |
| `hirotm lists add --board <id-or-slug> [name]` | `POST /api/boards/:id/lists` | Optional `--emoji`; append new list to end |
| `hirotm tasks add --board <id-or-slug> --list <id> --group <id> ...` | `POST /api/boards/:id/tasks` | Optional `--emoji`; body via `--body`, `--body-file`, or `--body-stdin` |
| `hirotm tasks update --board <id-or-slug> <task-id> ...` | `PATCH /api/boards/:id/tasks/:taskId` | Includes `emoji` with other mutable task fields |
| `hirotm tasks move --board <id-or-slug> <task-id> --to-list <id> [--to-status <id>]` | `PATCH /api/boards/:id/tasks/:taskId` | Convenience wrapper; append-to-end semantics |

Write commands should return compact normalized JSON objects, not full board payloads.

---

## Phase 4 — Board Structure & Extended Mutations

**Status: Not started**

Covers HTTP surfaces that go beyond single-task/list creation: **task group definitions**, **task priority definitions**, board/list lifecycle, and ordering — still excluding [view prefs and other UI-only](#cli-vs-ui-only-surface) endpoints.

| Area | HTTP / intent | Notes |
|------|----------------|-------|
| Task groups | `PATCH /api/boards/:id/groups` | Replace group rows (ids, labels, optional emoji per group) |
| Task priorities | `PATCH /api/boards/:id/priorities` | Replace priority definitions for the board |
| Board | `PATCH /api/boards/:id`, `DELETE /api/boards/:id` | Rename, slug, emoji; delete board |
| Lists | `PATCH /api/boards/:id/lists/:listId`, `DELETE ...`, reorder | Name, color, emoji; delete; reorder |
| Tasks | `DELETE /api/boards/:id/tasks/:taskId`, reorder-in-band | Delete task; explicit reorder when agents need exact placement |

Exact command names (`hirotm boards patch`, `hirotm boards groups`, …) can follow the same Git-style pattern as Phase 3; details belong in [ai-cli.md](./ai-cli.md) when implemented.

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
| … | … (extend as Phases 3–4 ship) |

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

## Future — Board-scoped task filters (CLI parity with header)

**Status: Not in CLI yet** — UI implements this; HTTP does not expose a filtered task list.

On the board, the header combines up to **four** dimensions when deciding which tasks to show (same idea in stacked lanes and merged lists): **task group**, **priority** (subset of board priorities), **date** (inclusive range + mode: opened / closed / any — matches `createdAt` / `closedAt` per `taskMatchesDateFilter` in `boardStatusUtils.ts`), and **workflow status** (per column/band, or intersected with the board’s visible statuses).

- **`hirotm boards show`** today returns the **entire** board payload. There is **no** CLI flag set equivalent to applying all four filters.
- **No server endpoint** returns “tasks for board B matching these filters”; the web app loads the board and filters in memory.
- **Plan:** add something like `hirotm boards tasks --board <id> …` or optional filters on `boards show` that **fetch once** then emit a filtered JSON task list (and/or narrow fields), reusing the same rules as the UI — ideally by moving shared pure filter helpers into `src/shared/` so CLI and UI stay aligned.

---

## Future — Advanced search (server-side filtering)

**Status: Blocked — no API yet**

A later iteration of **global** `hirotm search` / `GET /api/search` could filter server-side by **task group**, **priority**, **status**, date ranges, etc., in addition to FTS text. That requires **new HTTP API design and implementation**; the current search is FTS with optional `--board` scope only. Track server work separately; add CLI/MCP once the API exists.

This is distinct from [Future A](#future--board-scoped-task-filters-cli-parity-with-header): board-scoped filters can ship **without** a new API by post-processing a board fetch; advanced search filtering needs **server** support for efficiency and consistent ranking across large datasets.

---

## See also

- [ai-cli-design.md](./ai-cli-design.md) — full CLI design (requirements, decisions, command reference, errors, safety)
- [ai-cli.md](./ai-cli.md) — write-command spec for Phases 3–4
