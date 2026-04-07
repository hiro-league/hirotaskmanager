# Trash plan

This document breaks Trash implementation into phases with checklists. Product rules live in the requirements doc; technical shape lives in the design doc.

**Related documents**

- [Trash requirements](./trash-requirements.md) — scope, rules, and success criteria.
- [Trash design](./trash-design.md) — target data model, API, client flow, and code touchpoints.
- [Board statistics design](./board-stats-design.md) — stats behavior that active-only reads must preserve.
- [Notifications design](./notifications-design.md) — event and notification flow Trash must integrate with.
- [Multi-writer sync design](./multi-writer-sync-design.md) — board invalidation behavior for live sessions.
- [hirotm CLI — Design Document](./ai-cli-design.md) — current CLI and HTTP/API assumptions.

## Suggested order

1. Phase 1 — Schema and active-only storage core
2. Phase 2 — Trash API, write semantics, events, and notifications
3. Phase 3 — Client Trash page and live-app behavior
4. Phase 4 — CLI, verification, and follow-through

---

## Phase 1: Schema and active-only storage core

**Goal:** Add the `deleted_at` model and central active-read rules so live boards, stats, filters, and search automatically ignore effectively trashed entities.

### Checklist

- [x] Add a migration for `board.deleted_at`, `list.deleted_at`, and `task.deleted_at`.
- [x] Add supporting indexes for active reads first; add trash-page helper indexes only if needed.
- [x] Split storage helpers into raw existence vs active existence/read helpers.
- [x] Update `readBoardIndex()`, board lookup, and `loadBoard()` to return active rows only.
- [x] Update direct list/task reads to treat effectively trashed rows as unavailable in live surfaces.
- [x] Update `searchTasks()` to join against active board/list/task rows.
- [x] Keep board stats behavior unchanged by relying on active-only `loadBoard()` results.
- [x] Add focused tests for active-vs-trashed visibility rules at the storage/query layer.

### Exit criteria

- Live board reads behave as if trashed entities do not exist.
- Search, filters, and stats operate on the active set only.
- No route handler needs ad hoc `deleted_at` logic for basic live reads.

---

## Phase 2: Trash API, write semantics, events, and notifications

**Goal:** Change delete to mean "move to Trash" and add the dedicated server surface for listing, restoring, and permanently deleting explicit trash entries.

### Checklist

- [x] Change existing delete endpoints so they set `deleted_at` instead of hard-deleting.
- [x] Bump owning board `updated_at` for board/list/task trash and restore operations.
- [x] Add dedicated trash list queries for boards, lists, and tasks with parent context and `canRestore`.
- [x] Add `GET /api/trash/boards`, `GET /api/trash/lists`, and `GET /api/trash/tasks`.
- [x] Add restore endpoints for boards, lists, and tasks.
- [x] Add permanent-delete endpoints for boards, lists, and tasks.
- [x] Return `409 Conflict` for blocked restore when a parent is still trashed.
- [x] Keep permanent delete restricted to explicitly trashed targets only.
- [x] Update server notifications from `*.deleted` semantics to `*.trashed`, and add restore/permanent-delete actions.
- [x] Publish board invalidation events for trash, restore, and purge flows without introducing state drift.
- [x] Add focused route/storage tests for trash, restore, purge, and parent-blocked restore cases.

### Exit criteria

- Normal delete flows move entities to Trash without breaking live reads.
- Trash APIs return explicit trash rows only, not descendants hidden only by a trashed parent.
- Restore and purge semantics match the design, including blocked-child restore behavior.

---

## Phase 3: Client Trash page and live-app behavior

**Goal:** Expose Trash as a first-class page while keeping the normal board experience active-only and low-friction.

### Checklist

- [x] Add a top-level `/trash` route.
- [x] Add a Trash item to the sidebar while continuing to show only active boards in board navigation.
- [x] Add Trash queries and React Query keys for board/list/task trash tabs.
- [x] Build a Trash page with Boards, Lists, and Tasks tabs ordered by newest `deletedAt` first.
- [x] Show enough row context for restore/purge actions, including parent board/list names where relevant.
- [x] Disable restore when `canRestore` is false and explain which parent must be restored first.
- [x] Update normal delete confirmation copy to say "Move to Trash" and reserve "Delete permanently" for purge flows.
- [x] Add restore and purge mutations with board index, board detail, board stats, and trash-list invalidation.
- [x] Redirect away from a board page when that board becomes trashed, including external-write cases.
- [ ] Manually verify board page, sidebar, filters, stats, and search after trash/restore/purge flows.

### Exit criteria

- Users can inspect and act on Trash from a dedicated page.
- The live app stays focused on active entities only.
- Open board sessions recover cleanly when the viewed board becomes trashed.

---

## Phase 4: CLI, verification, and follow-through

**Goal:** Bring `hirotm` in line with Trash semantics and close the loop on migration, policy handling, and release confidence.

### Checklist

- [x] Update `hirotm` delete command help text to say "move to trash".
- [x] Keep existing delete verbs but route them to the new move-to-trash endpoints.
- [x] Add explicit `restore` and `purge` commands for boards, lists, and tasks.
- [x] Add a minimal trash inspection command surface.
- [x] Keep board CLI policy enforcement intact for trash, restore, and purge operations.
- [x] Add CLI-focused tests or manual checks for active reads, trash listing, restore, and purge.
- [ ] Run migration verification against an existing local database with no backfill beyond `NULL` defaults.
- [ ] Run end-to-end checks across UI and CLI for board, list, and task trash flows.
- [x] Update docs/help text where user-facing delete wording changed.

### Exit criteria

- `hirotm` matches the server Trash model and no longer implies hard delete for normal delete commands.
- Existing data migrates cleanly with the new nullable columns and indexes.
- UI and CLI behavior agree on what is active, trashed, restorable, and permanently deleted.

---

## Risks to watch

- Active predicate drift between board reads, direct reads, search, and trash routes.
- Confusing restore UX when a child is explicitly trashed under a still-trashed parent.
- Semantic drift where UI, CLI, or notifications still say "delete" when they mean "move to Trash".
- Cache invalidation gaps after external trash/restore/purge writes.

## Explicit deferrals

- Trash-specific FTS search.
- Bulk restore or bulk permanent delete.
- Per-user trash ownership or archive concepts.
- Additional trash metadata such as "deleted by".
