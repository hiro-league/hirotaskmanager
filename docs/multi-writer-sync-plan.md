# Multi-writer sync plan

This document breaks the multi-writer sync work into execution phases. Product intent lives in the requirements doc; technical shape lives in the design doc.

**Related documents**

- [Multi-writer sync requirements](./multi-writer-sync-requirements.md) — what must be true when this is done.
- [Multi-writer sync design](./multi-writer-sync-design.md) — target architecture and API/client model.
- [hirotm CLI — Design Document](./ai-cli-design.md) — current CLI contract and HTTP assumptions.

## Suggested order

1. Phase 1 — Immediate correctness with SSE invalidation
2. Phase 2 — Granular storage returns behind existing routes
3. Phase 3 — API contract and shared type changes
4. Phase 4 — Client mutation cache patching
5. Phase 5 — CLI response adaptation
6. Phase 6 — Typed SSE partial refresh and scaling polish

---

## Phase 1: Immediate correctness with SSE invalidation

**Goal:** Make the open board page react to external writes as soon as possible, without waiting for the full granular architecture.

### Checklist

- [ ] Add a small server event bus module for board-scoped subscribers.
- [ ] Add `GET /api/events` using SSE.
- [ ] Emit a board-changed event after successful board/list/task writes.
- [ ] Add a client hook that subscribes to board-scoped events.
- [ ] On event, invalidate the active board query and related board stats queries.
- [ ] Add keepalive behavior and cleanup handling for disconnected clients.

### Exit criteria

- An open board tab updates after a CLI write without manual refresh.
- Existing browser mutation UX still works.
- No API response contracts have changed yet.

### Notes

- This is the fastest safe phase and can ship first.
- This phase still uses full-board refetch after change events.

---

## Phase 2: Granular storage returns behind existing routes

**Goal:** Stop making small storage writes depend on `loadBoard(boardId)` internally.

### Checklist

- [ ] Add focused read helpers such as `readTaskById` and `readListById`.
- [ ] Refactor task storage mutations to return granular results plus `boardUpdatedAt`.
- [ ] Refactor list storage mutations to return granular results plus `boardUpdatedAt`.
- [ ] Refactor board metadata writes to return lightweight board-level results where practical.
- [ ] Keep `loadBoard(boardId)` for full-board reads and fallback paths.
- [ ] Preserve current route behavior temporarily so the external API does not break yet.

### Exit criteria

- Storage-layer writes no longer require full-board reloads to know what changed.
- Route handlers can still keep the old public contract while this phase is in progress.

### Notes

- This is mostly an internal refactor.
- It reduces backend coupling before changing public API behavior.

---

## Phase 3: API contract and shared type changes

**Goal:** Change small mutation endpoints so they return granular mutation result envelopes instead of full `Board` payloads.

### Checklist

- [ ] Add shared mutation-result types in `src/shared/`.
- [ ] Update task create/update/delete routes to return granular results.
- [ ] Update list create/update/delete routes to return granular results.
- [ ] Decide which structural routes still use board invalidation rather than granular patching.
- [ ] Keep `GET /api/boards/:id` unchanged for full-board reads.
- [ ] Add or document targeted read endpoints needed for later partial refresh.

### Exit criteria

- Single-entity write routes no longer send the entire board.
- Shared types clearly distinguish full-board reads from mutation results.

### Dependency notes

- This phase should be coordinated with Phase 4 and Phase 5.
- Either ship those phases together or temporarily support both old and new response formats.

---

## Phase 4: Client mutation cache patching

**Goal:** Make browser mutations consume granular responses and patch cached board state surgically.

### Checklist

- [ ] Update `src/client/api/mutations/tasks.ts` to patch task changes into cached board state on success.
- [ ] Update `src/client/api/mutations/lists.ts` to patch list changes into cached board state on success.
- [ ] Update `src/client/api/mutations/board.ts` to patch board metadata without replacing unrelated task/list data.
- [ ] Keep optimistic `onMutate` behavior aligned with the new success path.
- [ ] Continue invalidating stats queries where needed.
- [ ] Verify unchanged entities retain stable references where possible.

### Exit criteria

- Browser-originated writes no longer replace the cached board wholesale on success.
- A small task edit updates one cached task instead of replacing all tasks.

### Notes

- This phase should not require a major board component rewrite.
- The query cache still exposes a full `Board` to rendering code.

---

## Phase 5: CLI response adaptation

**Goal:** Keep `hirotm` aligned with the new mutation contracts.

### Checklist

- [ ] Update CLI mutation fetch types to use granular result envelopes.
- [ ] Remove the need to infer changed entities from a returned full board.
- [ ] Simplify helpers such as `findNewestTask`, `findNewestList`, and `findTaskById` where they are no longer needed.
- [ ] Keep existing command names, flags, and output envelope semantics stable for users.
- [ ] Verify CLI output still reports board id, board slug, board updated time, and compact entity data.

### Exit criteria

- `hirotm` write commands work against the new API without behavioral regressions.
- CLI still uses the local HTTP API only.

### Notes

- This is a contract-alignment phase, not a product-surface redesign.

---

## Phase 6: Typed SSE partial refresh and scaling polish

**Goal:** Move from generic board invalidation to event-aware partial refresh where it pays off.

### Checklist

- [ ] Extend SSE events to typed payloads such as `task-updated`, `task-deleted`, and `list-updated`.
- [ ] Add targeted entity read endpoints if not already added.
- [ ] Update the client event hook to fetch and patch a single entity for granular events.
- [ ] Keep full-board invalidation for structural or recovery events.
- [ ] Compare event `boardUpdatedAt` to cached board state to avoid unnecessary self-refresh work where possible.
- [ ] Profile large boards and verify that common small writes avoid full-board fetches.

### Exit criteria

- External task/list writes usually resolve through tiny events plus small entity reads.
- Full-board refetch becomes a fallback path, not the default steady-state behavior.

### Notes

- This phase delivers the scalability benefit for boards with many tasks.
- It can ship after the core correctness and contract work is already complete.

---

## Phase grouping guidance

### Safe independent phases

- Phase 1 can ship alone.
- Phase 2 can ship alone.
- Phase 6 can ship after the contract and client phases are complete.

### Coordinated phases

- Phase 3, Phase 4, and Phase 5 should be treated as one coordinated delivery unless the server temporarily supports both response shapes.

## Recommended ship sequence

### Milestone A

- Phase 1

Result:

- the product becomes multi-writer correct quickly

### Milestone B

- Phase 2

Result:

- storage and server internals are ready for granular contracts

### Milestone C

- Phase 3
- Phase 4
- Phase 5

Result:

- small writes become granular end to end across API, browser, and CLI

### Milestone D

- Phase 6

Result:

- high-scale behavior improves and full-board refetch becomes rare

## Risks to watch

- Response-contract drift between API and CLI during the transition.
- Missing board-index invalidation when boards are created, renamed, or deleted externally.
- Structural operations being forced into overly granular handling when a refetch would be simpler and safer.
- Cache patch bugs that leave the browser in a locally inconsistent state after successful writes.

## Non-goals for this plan

- Replacing the initial full-board `GET /api/boards/:id` read model.
- Reworking board rendering into a normalized entity store.
- Introducing collaboration features beyond state convergence.
