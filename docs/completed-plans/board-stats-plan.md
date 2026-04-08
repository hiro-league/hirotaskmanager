# Board statistics plan

This document breaks implementation into phases with checklists. It is execution-oriented; product rules live in the requirements doc and architecture in the design doc.

**Related documents**

- [Board statistics requirements](./board-stats-requirements.md) — what to build and what to defer.
- [Board statistics design](./board-stats-design.md) — API, hybrid client/server model, caching, queries, concerns.

## Suggested order

1. Phase 1 — Server stats core + API
2. Phase 2 — Client queries + board/list chips UI
3. Phase 3 — Polish, cache tuning, and verification
4. Phase 4 — Optional follow-ups (CLI, embedding, deeper optimization)

---

## Phase 1: Server stats core and HTTP API

**Goal:** One canonical stats implementation callable from HTTP; board + per-list `T` / `O` / `C` for a normalized filter payload.

### Checklist

- [x] Add shared types for normalized filter input and stats response (align with design doc shapes).
- [x] Implement server-side stats module: load board + statuses, build closed-status set, single-pass aggregation over tasks matching filters.
- [x] Add `GET /api/boards/:id/stats` (or agreed path) with query params matching the normalized filter.
- [x] Wire route in the server app; return JSON including every list id with zero counts where applicable.
- [x] Unit or integration tests for edge cases: empty board, empty filter match, all closed, date filter boundaries.
- [x] Manual check: `hirotm`-compatible curl or temporary CLI one-liner against local API (formal CLI command can wait for Phase 4).

### Exit criteria

- Same filter payload produces stable, documented counts vs manual spot-check on a dev board.
- No dependency on the React app for correctness; API is the source of truth for numbers.

---

## Phase 2: Client data layer and board UI

**Goal:** Board page shows stats chips per requirements; stats load via TanStack Query with sensible keys and loading UX.

### Checklist

- [x] Add `useBoardStats(boardId, filter)` (or equivalent) with query key including `boardId` + stable filter signature (not `board.updatedAt`, to avoid churn from optimistic board updates; mutations invalidate stats).
- [x] Consider `placeholderData` / previous-data behavior while filters change; align with subtle in-chip loading from requirements.
- [x] Invalidate or refetch stats when board mutations succeed (task/list/board changes that affect task rows).
- [x] Render board-level `T` / `O` / `C` chips in title row per placement in requirements (after search and filter summary pills).
- [x] Render list-level chips in sticky sub-header below list title; match layout/stacked code paths.
- [x] Single visibility toggle (e.g. beside card size) for all stats; default hidden; persist per board via `show_counts` → `Board.showStats`.
- [x] Chip styling: single-letter labels, colors per design (including orange for `O`).

### Exit criteria

- Toggling filters updates counts to match server response; no full-word labels on chips.
- Stats hidden by default; show/hide persists per board like other filters.

---

## Phase 3: Performance pass and hybrid behavior

**Goal:** Server in-process cache (if not in Phase 1), query tuning, optional optimistic overlay — without changing product semantics.

### Checklist

- [ ] Add server-side memo cache keyed by `boardId`, `board.updatedAt`, and filter signature (per design).
- [ ] Profile stats endpoint with realistic board sizes; adjust `staleTime` / refetch triggers only if needed.
- [ ] Optional: short-term client-side recomputation from `board.tasks` after optimistic mutations for snappier chips; reconcile on stats query success.
- [ ] Document any debouncing decision for rapid filter changes (or explicitly “none” if query cancellation is enough).

### Exit criteria

- No obvious jank or request storms on filter spam; chips stay consistent with API after mutations settle.

---

## Phase 4: Optional follow-ups

**Goal:** Extend reach without blocking core ship.

### Checklist

- [ ] `hirotm boards stats <id-or-slug>` (or similar) calling the stats API with JSON output.
- [ ] Embed stats in board detail response if profiling shows round-trip wins.
- [ ] Materialized counters or DB-level aggregates only if Phase 3 proves insufficient.
- [ ] Dashboard/reporting hooks — separate product; reuse same stats module.

### Exit criteria

- Each item is independently shippable; core board stats work without Phase 4.

---

## Shared implementation notes

- Centralize filter predicate logic in one shared module used by stats service and, over time, by board rendering paths to reduce drift (see design doc “Filter logic drift”).
- Keep date filter semantics identical between server stats and client display (timezone / calendar-day rules).

## Out of scope (this plan)

- CLI **write** flows and agent automation — tracked elsewhere.
- Search as a dimension for statistics — never; see requirements.
- Dashboard UI, charts, cross-board analytics — future.
- `3/5` matched-vs-total chips — future.
- Archived / deleted / hidden entities — not in product yet.
- URL encoding of stats visibility.

## Explicit deferrals (may overlap requirements “Future options”)

- Lucide or non-emoji chip icons for `T`/`O`/`C`.
- Per-filter label counts (e.g. next to group names).
- Persistent SQL aggregate tables unless performance demands.

## Feedback

**Stats queries only (not full-board load, not search):** the current stats path loads the board via `loadBoard` (all tasks for `board_id`), then aggregates in memory with the shared filter predicate. Existing indexes such as `idx_task_board` help the `WHERE board_id = ?` task query, but they do **not** remove the cost of scanning every task row for that board in application code. Adding more single-column indexes on `priority_id`, `created_at`, `closed_at`, etc. will not meaningfully speed up stats until filtering moves into SQL or precomputed aggregates.

For stats performance, prioritize **Phase 3**: server-side memo cache keyed by `board_id`, `board.updated_at`, and filter signature; optional composite index on `task` if profiling shows the `loadBoard` task `ORDER BY` is hot (e.g. `(board_id, list_id, status_id, sort_order, id)`). Reserve SQL-level aggregates or materialized counters only if profiling after caching still shows a need.
