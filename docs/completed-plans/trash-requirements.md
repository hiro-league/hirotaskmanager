# Trash requirements

**Related documents**

- [Trash design](./trash-design.md) — proposed technical design, data model, API, and integration scope.
- [Board statistics requirements](./board-stats-requirements.md) — existing stats semantics that trash must preserve.
- [Notifications requirements](./notifications-requirements.md) — notification expectations that trash actions must fit into.
- [hirotm CLI — Design Document](./ai-cli-design.md) — current CLI and HTTP/API assumptions.

This document captures the product and architecture requirements for replacing destructive board/list/task deletes with a Trash feature.

## Problem statement

Today, deleting a board, list, or task permanently removes it. That makes mistakes hard to recover from and turns normal cleanup actions into destructive operations.

The product needs a Trash model where:

- normal delete actions move the entity to Trash
- trashed entities disappear from the live app as if they no longer exist
- users can review trashed entities on a dedicated page
- users can restore or permanently delete them later
- the model remains understandable for boards, lists, and tasks without soft-delete cascade complexity

## Product decision

This feature uses a **no-cascade soft delete** model.

- Deleting a board marks **only the board** as trashed.
- Deleting a list marks **only the list** as trashed.
- Deleting a task marks **only the task** as trashed.
- Child entities become hidden from live surfaces when an ancestor is trashed, but their own rows are not automatically marked trashed.
- Database cascade remains relevant only for **permanent delete**.

## Definitions

- **Explicitly trashed** — the entity itself has been moved to Trash by the user.
- **Effectively trashed** — the entity is hidden because it or an ancestor is trashed.
- **Active** — visible in normal app surfaces and returned by normal read/search/list APIs.

For v1:

- a board is active when the board itself is not trashed
- a list is active when the list is not trashed and its board is active
- a task is active when the task is not trashed, its list is active, and its board is active

## Scope

This effort covers:

- moving boards, lists, and tasks to Trash instead of permanently deleting them during normal delete actions
- a dedicated Trash page reachable from the sidebar
- separate Trash tabs for **Boards**, **Lists**, and **Tasks**
- restore actions from Trash
- permanent delete actions from Trash
- keeping board views, counts, filters, statistics, and search limited to active entities
- keeping CLI reads and writes aligned with the same active-vs-trash rules
- preserving restore behavior without soft-delete cascade
- handling boards/lists/tasks that become unavailable while a page is open
- updating notifications and live invalidation semantics to reflect trash, restore, and permanent delete

This effort does not require:

- a separate archive concept
- multi-user trash ownership or per-user trash views
- offline trash behavior
- trash search beyond the basic Trash page list view in v1
- restoring a child into a still-trashed parent

## Core product requirements

### Delete behavior

- The main delete action for a board, list, or task must move that entity to Trash instead of permanently deleting it.
- A trashed board must disappear from the sidebar and from normal board navigation.
- A trashed list must disappear from the live board view, and its tasks must no longer appear on the live board.
- A trashed task must disappear from the live board view.
- Once an entity is trashed, normal app surfaces should treat it as not existing.

### No-cascade semantics

- Trashing a board must not automatically mark its lists or tasks as explicitly trashed.
- Trashing a list must not automatically mark its tasks as explicitly trashed.
- Explicit trash state must reflect direct user intent on that entity only.
- Visibility of descendants under trashed ancestors must be derived from hierarchy, not redundantly stored on descendants.

### Trash page

- The app must provide a dedicated Trash page in the sidebar.
- The Trash page must be separate from normal board pages.
- The Trash page must provide tabs for **Boards**, **Lists**, and **Tasks**.
- Trash lists should show enough context to understand what is being restored or permanently deleted.
- Trash rows should show at least entity identity and deletion time.
- Trashed lists and tasks should show parent board context.
- Trashed tasks should show parent list context when available.

### Restore behavior

- Restoring a board must make the board visible to normal app surfaces again.
- Restoring a list must make the list visible again only when its board is active.
- Restoring a task must make the task visible again only when both its board and list are active.
- If a parent is still trashed, restoring a child must be blocked with a clear explanation rather than silently restoring it into a hidden state.
- Restoring a board must not automatically restore lists or tasks that were explicitly trashed earlier.
- Restoring a list must not automatically restore tasks that were explicitly trashed earlier.

### Permanent delete behavior

- Permanent delete must be available only from Trash-related surfaces, not from the normal live delete flow.
- Permanently deleting a board must remove the board and all dependent data using database cascade.
- Permanently deleting a list must remove the list and its tasks using database cascade.
- Permanently deleting a task must remove the task row.
- Permanent delete must be irreversible.
- Confirmation UX for permanent delete should be stronger than restore UX.

### Live app behavior

- Active board lists, board detail, task reads, list reads, and board task listings must exclude effectively trashed entities.
- A trashed board must not count toward sidebar contents, home redirect selection, or normal board reads.
- Live board statistics must ignore effectively trashed lists and tasks.
- Existing board filters must continue to operate over the active task set only.
- Existing task-title/list/group/status FTS search must exclude effectively trashed tasks by default.
- Existing counts in the app should behave as if trashed entities do not exist.

### Child/parent edge cases

- If a task is explicitly trashed and the parent list is later trashed, restoring the list must not restore that task.
- If a list is explicitly trashed and the parent board is later trashed, restoring the board must not restore that list.
- If a task is active but its list or board is trashed, the task should be effectively hidden but not shown as an explicit Trash row unless the task itself was directly trashed.
- Trash should avoid noisy duplication. Children hidden only because a parent is trashed should not appear as separate explicit trash entries.

### Existing behavior that remains unchanged

- Duplicate task titles and duplicate list titles remain allowed exactly as today.
- Multi-user permissions beyond the current app model remain out of scope.
- Offline behavior remains out of scope.

## CLI requirements

- Existing delete commands in `hirotm` must become move-to-trash commands rather than permanent delete commands.
- Existing CLI read commands such as board list/show, board task listing, and search must exclude effectively trashed entities by default.
- The CLI must gain explicit restore and permanent delete operations.
- The CLI must gain a way to inspect trashed boards, lists, and tasks.
- CLI trash operations must continue to respect the owning board's CLI policy rules.

## Notifications and live-update requirements

- Move-to-trash, restore, and permanent delete actions must remain visible to the notifications system.
- Notification wording should reflect the new semantics instead of reporting move-to-trash as permanent deletion.
- Open browser sessions must still converge after trash, restore, or permanent delete actions triggered from the UI or CLI.

## Data-model requirements

- The design must keep board/list/task identity stable while entities are in Trash so restore does not require id remapping.
- The design must avoid separate parallel trash tables in v1.
- The design must keep existing dependent board data such as view preferences, CLI policy, groups, and priorities attached to the board row while the board is trashed.

## Compatibility requirements

- The feature must fit the current SQLite + Bun + Hono + React Query architecture.
- The feature must work for both browser writes and `hirotm` writes.
- The feature must keep the HTTP API as the supported mutation path.
- The feature must keep current FTS search infrastructure usable rather than replacing it outright.

## Non-goals

- Full-text search dedicated to trash content in v1
- Per-user trash ownership or permissions beyond current board policy
- Soft-delete cascade metadata such as "deleted via parent"
- Separate archive and trash concepts
- Direct database access from CLI

## Success criteria

- Deleting a board, list, or task moves it to Trash and removes it from live views.
- The Trash page in the sidebar shows explicit trash entries in Boards, Lists, and Tasks tabs.
- Restoring an entity returns it to live surfaces when its parent chain is active.
- Restoring a parent does not resurrect children that were explicitly trashed earlier.
- Permanent delete removes the entity irreversibly and uses existing database cascade where appropriate.
- Board loading, stats, filters, and default FTS search all behave as though trashed entities do not exist.
- `hirotm` delete commands move entities to Trash, while restore/permanent-delete commands are explicit.
- The requirements are clear enough to drive a detailed technical design and implementation plan.
