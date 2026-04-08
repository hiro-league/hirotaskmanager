# Task group editor plan

This document breaks the task group editor cleanup into phases with checklists. Product requirements and target architecture live in the combined requirements/design document.

**Related documents**

- [Task group editor requirements and design](./task-group-editor-requirements-design.md) - target UX, data model, API contract, and migration rules.
- [Emoji icons design](./emoji-icons-design.md) - emoji behavior task groups must continue to support.
- [hirotm CLI - Design Document](./ai-cli-design.md) - current CLI and HTTP/API behavior that may need follow-up alignment.

## Suggested order

1. Phase 1 - Schema and board read model
2. Phase 2 - Server mutation contract and transactional behavior
3. Phase 3 - Client editor rewrite and default handling
4. Phase 4 - App-wide follow-through, CLI updates, and verification

---

## Phase 1: Schema and board read model

**Goal:** Add the persisted fields needed for explicit ordering and explicit defaults without changing the editor yet.

### Checklist

- [x] Add a migration for `task_group.sort_order`.
- [x] Add a migration for `board.default_task_group_id`.
- [x] Add a migration for `board.deleted_group_fallback_id`.
- [x] Backfill `task_group.sort_order` from current board-local group order.
- [x] Backfill both board-level group pointers to the first current group for each board.
- [x] Update board load/storage code to read task groups ordered by `sort_order ASC, id ASC`.
- [x] Extend shared models and board payloads with `sortOrder`, `defaultTaskGroupId`, and `deletedGroupFallbackId`.
- [x] Enforce the invariant that every active board has at least one group plus valid default and fallback group IDs after migration/backfill.
- [x] Add storage-focused tests for migration/backfill and board read ordering.

### Exit criteria

- Every active board has explicit persisted group order.
- Every active board has explicit default and deleted-group fallback IDs.
- Board detail reads expose the new fields without changing task membership behavior yet.

---

## Phase 2: Server mutation contract and transactional behavior

**Goal:** Introduce an explicit, testable save contract for task group editing.

### Checklist

- [x] Replace the existing `PATCH /api/boards/:id/groups` contract with the new explicit task group editor payload.
- [x] Define request validation for `creates`, `updates`, `deletes`, `defaultTaskGroupId`, and `deletedGroupFallbackId`.
- [x] Implement one-transaction server behavior for create, update, reorder, reassign, delete, and board-pointer updates.
- [x] Reject ambiguous or invalid saves:
- [x] deleted group also present in updates
- [x] delete destination points at a deleted group
- [x] default or fallback points at a deleted or missing group
- [x] zero surviving groups after creates and deletes are resolved
- [x] deleting the last surviving group without a replacement in the same save
- [x] empty or invalid labels
- [x] Keep board `updated_at`, invalidation, and notification behavior aligned with existing board-structure changes.
- [x] Remove the old replacement-array route handling rather than preserving it behind compatibility logic.
- [x] Add focused route/storage tests for:
- [x] create plus delete in one save
- [x] deleting a group with explicit reassignment
- [x] attempting to delete the last surviving group
- [x] deleting multiple groups with different destinations
- [x] rename preserving group identity
- [x] reorder preserving group identity
- [x] defaults surviving reorder and rename

### Exit criteria

- The server can represent the intended editor behavior without inferring meaning from reused IDs.
- Deleted-group task reassignment is explicit and transactional.
- Tests cover the ambiguity that exists in today's replacement-array flow.

---

## Phase 3: Client editor rewrite and default handling

**Goal:** Replace the current editor state model with an explicit draft model and surface the new behavior clearly in the UI.

### Checklist

- [x] Replace numeric temporary row IDs with draft rows keyed by `clientId`.
- [x] Add draft support for persisted `id`, `sortOrder`, delete state, task count, and optional per-delete reassignment.
- [x] Add inline reorder support and keep draft order stable while editing.
- [x] Show task counts per row.
- [x] Add UI for board default group selection.
- [x] Add UI for deleted-group fallback selection.
- [x] When deleting a group with tasks, require or strongly surface a reassignment destination before save.
- [x] Prevent the draft from saving with zero surviving groups or without a valid default/fallback selection.
- [x] Make it clear in the UI that at least one group must always remain.
- [x] Generate explicit `creates`, `updates`, and `deletes` from the baseline-vs-draft diff.
- [x] Replace the current save mutation with the new server contract.
- [x] Update optimistic/cache handling so board detail stays consistent after save.
- [x] Update copy so the outcome is explicit and no longer says or implies "removed groups move to the first group".
- [x] Add tests for patch building from the editor (`taskGroupConfig.test.ts`) and storage for `moveTasksToClientId` deletes (`boardTaskGroupsPhase2.test.ts`); no `.test.tsx` pattern in this area yet.

### Exit criteria

- The editor can explain exactly what save will do.
- New rows can no longer accidentally target an existing task group.
- Users can set board defaults and deleted-group fallback from the same screen.

---

## Phase 4: App-wide follow-through, CLI updates, and verification

**Goal:** Make the rest of the app and CLI consistently respect explicit group order and defaults, and fully remove the old ambiguous behavior.

### Checklist

- [x] Update task creation defaults to use `board.defaultTaskGroupId` when no more specific active-group context applies.
- [x] Update keyboard or quick-switch group cycling to use explicit group order.
- [x] Update any board/group pickers that still assume "first group" or ID order.
- [x] Audit storage and client code for remaining "first task group" fallback behavior.
- [x] Update `hirotm` task-group write commands to send the explicit `creates`/`updates`/`deletes` payload.
- [x] Remove CLI support and docs for replacement-array task-group writes.
- [x] Add CLI help examples showing reassignment, default group, and fallback group behavior.
- [x] Add CLI verification or tests for invalid saves such as deleting the last surviving group.
- [x] Remove dead client, server, and CLI code that only supported the old replacement-array semantics.
- [ ] Run manual verification for:
- [ ] delete highest-ID group then add a new one
- [ ] delete non-highest-ID group then add a new one
- [ ] delete group with tasks and custom reassignment
- [ ] delete group with no tasks
- [ ] attempt to save with zero surviving groups and confirm rejection
- [ ] reorder groups and confirm visible order everywhere
- [ ] create new task with board default group
- [ ] CLI task-group save with explicit creates, updates, and deletes
- [x] Add or update docs/help text for any user-facing behavior changes.

### Exit criteria

- No visible app behavior depends on accidental database ID order.
- The editor, task creation flow, and group navigation all use the same explicit defaults and ordering.
- The old ambiguous behavior is removed completely across web, server, and CLI.

---

## Risks to watch

- Migration bugs that leave a board without valid default or fallback group pointers.
- Transaction ordering mistakes where board defaults are updated before delete validation is complete.
- Optimistic UI drift if the client and server compute task reassignment differently.
- Scope creep from folding CLI redesign into the first pass.
- Reorder support touching more surfaces than expected because multiple areas currently rely on ID order.

## Recommended implementation notes

- Prefer shipping Phase 1 plus Phase 2 before the UI rewrite lands, so the new editor has a stable server contract to target.
- Treat "first group" behavior as technical debt to eliminate everywhere, including the CLI and any helper utilities.
- Do not keep a compatibility path for the old replacement-array contract; removing it is part of the cleanup.

## Explicit deferrals

- Per-user default task groups.
- Undo history specifically for task group editor operations.
- Rich per-group audit history beyond current board update notifications.
- Bulk cross-board task group administration.
