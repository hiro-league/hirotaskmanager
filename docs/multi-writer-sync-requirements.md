# Multi-writer sync requirements

This document captures the core product and architecture requirements for making the TaskManager web app react correctly to board/list/task changes made outside the current browser session, especially through `hirotm`.

## Related documents

- [Multi-writer sync design](./multi-writer-sync-design.md) — target architecture, API shape, client data flow, and scalability model.
- [Multi-writer sync plan](./multi-writer-sync-plan.md) — execution phases and rollout order.
- [hirotm CLI — Design Document](./ai-cli-design.md) — existing CLI scope and HTTP/API assumptions.

## Problem statement

The current web app assumes the browser is the main writer for board state. That assumption no longer holds once `hirotm` can create and update boards, lists, and tasks.

Today:

- the board page loads board detail with `GET /api/boards/:id`
- board/list/task mutation endpoints return the full `Board`
- React Query caches the full board and replaces that cache entry on mutation success
- the browser does not subscribe to server-side changes from other writers

As a result, a CLI write can succeed in SQLite and through the HTTP API while the open board page continues showing stale state until a manual refresh, remount, or later refetch.

## Scope

This effort covers:

- board detail pages in the web app
- board/list/task writes performed by the browser, `hirotm`, and future local API consumers
- HTTP API response design for writes
- server-to-browser change notification
- client cache update strategy

This effort does not require:

- multi-user authentication
- conflict-resolution UI
- shared-presence cursors
- true collaborative text editing

## Core requirements

### Functional

- The web app must detect writes made outside the current browser session without requiring manual refresh.
- An open board page must converge to correct server state after external writes.
- Browser-originated writes and CLI-originated writes must flow through the same server-side mutation rules.
- The server/API must remain the source of truth for persisted board state.
- Initial board page load may continue using one full-board read model.
- Write operations should not require returning the full `Board` payload when only one entity changed.
- The design must support future non-browser writers beyond `hirotm` without re-architecting again.
- The board sidebar/index must stay correct when boards are created, renamed, or deleted externally.

### Non-functional

- The solution should preserve the current rendering model where board components read a `Board` object from React Query.
- The solution should minimize unnecessary payload transfer and avoid full-board reads on every small write in the target design.
- The design should remain simple enough to ship incrementally on the current Bun + Hono + React Query architecture.
- The system should remain correct for boards with thousands of tasks.
- The design should prefer eventual consistency within a short window over perfect distributed coordination complexity.

## Canonical data ownership

- SQLite remains the persisted source of truth.
- The HTTP API remains the only supported mutation path for app data.
- The browser cache is a derived read model used for rendering and optimistic UX.
- The CLI is not a special case; it is one more API client.

## Required user experience

- If a task is updated by `hirotm`, the open board should reflect that change automatically.
- If a task is created or deleted by `hirotm`, the open board should reflect that change automatically.
- If a list is created, renamed, reordered, or deleted externally, the open board should converge automatically.
- If board metadata changes externally, the board header and sidebar should converge automatically.
- Browser interactions should remain responsive; optimistic updates are still allowed.

## API-level requirements

- The API must distinguish between:
  - full board reads used for initial hydration or fallback recovery
  - targeted write responses used to describe the changed entity
- The API must expose a server-to-browser notification channel for board changes.
- The API should support targeted read endpoints for single entities when partial refresh is needed.
- Structural writes that affect many entities at once may use a coarser refresh strategy than single-entity writes.

## Scalability requirements

- Updating one task should not require reading or sending every task on the board in the target design.
- The client should be able to patch one entity into cached board state without replacing unrelated entities.
- The design should support a fallback full-board refetch for recovery or structural changes, but that should not be the normal path for small mutations.
- The server notification payload should be lightweight and should describe what changed, not resend the whole board.

## Compatibility requirements

- Existing board rendering components should require little or no behavioral rewrite.
- Existing optimistic mutation UX should remain valid.
- `hirotm` should continue using the local HTTP API; it must not read SQLite directly.
- Migration should be possible in phases, with an early step that solves stale browser state before the full granular architecture lands.

## Non-goals

- Real-time collaborative editing semantics.
- Operational transform or CRDT infrastructure.
- Cross-device push infrastructure beyond the local TaskManager server.
- Replacing React Query with a custom state system.
- Replacing the current full-board read model for initial page load.

## Success criteria

- The web app stays in sync with CLI writes during an active session.
- Small writes use granular server responses and granular client cache updates.
- Full-board reloads remain available as a fallback path, not the default write path.
- The design is clear enough to execute in phased implementation without blocking the current product.
