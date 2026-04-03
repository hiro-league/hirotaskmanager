# Board statistics design

**Related documents**

- [Board statistics requirements](./board-stats-requirements.md) — product scope, chip UX, filters, persistence, and non-goals.
- [Board statistics plan](./board-stats-plan.md) — phased implementation checklists and deferrals.

This document describes the proposed technical design for board and list task count statistics on the board page.

## Design summary

- Make the **server/API** the canonical source of statistics.
- Use a **hybrid** client model: render canonical server stats, with optional local optimistic recalculation for responsive UI updates.
- Keep **task** stats aligned with **priority, group, and date** filters (not status visibility — see [Filter model](#filter-model)).
- Design the stats service so it can later support the CLI and a dashboard, even if those consumers are not in scope for the first implementation.

## Canonical ownership

Statistics should not be a board-page-only trick. The long-term source of truth should be a dedicated server-side stats capability that computes:

- one board-level aggregate: `T`, `O`, `C` (the UI may also show **L** — list count — from `board.lists.length` without extending the stats API)
- one per-list aggregate for every list on the board

This keeps the logic reusable for:

- the board page
- future CLI read commands
- future reporting/dashboard features

The browser may still derive temporary counts locally after optimistic mutations, but those values are a UX optimization layered on top of the server result, not the canonical definition.

## Definitions and semantics

- **Closed**: task status where `Status.isClosed === true`
- **Open**: any task that is not closed
- **Total**: all tasks in scope after applying the active stats filters (priority, group, date — **not** status visibility; **O** / **C** already reflect workflow closed vs non-closed).

Search is explicitly **out of scope** for statistics. Search results do not define the stats subset and should not affect board or list counts.

**Status visibility** toggles are also **out of scope** for narrowing stats: the counting predicate must not require `task.status` to appear in the board’s visible-status list; otherwise **T / O / C** would double-apply status semantics.

## Filter model

Normalize the task-level board filters that apply to statistics (priority, group, date) into one server/client-friendly shape:

```ts
interface BoardStatsFilter {
  activeGroupId: string;
  activePriorityIds: string[] | null;
  dateFilter: {
    mode: "opened" | "closed" | "any";
    startDate: string;
    endDate: string;
  } | null;
}
```

Recommended rule: both the server stats service and any client optimistic fallback should consume the **same normalized filter object**.

Any new **task** filter that should affect **T / O / C** should extend this object and flow through the same predicate/service, rather than adding one-off logic in individual components. Status column visibility remains a **display** concern only.

Legacy clients may still send `visibleStatuses` on `GET /api/boards/:id/stats`; the server **ignores** it for aggregation.

## API model

Recommended endpoint:

```txt
GET /api/boards/:id/stats
```

Recommended query parameters:

- `group`
- `priorityIds`
- `dateMode`
- `startDate`
- `endDate`

(`visibleStatuses` is ignored if present.)

Recommended response shape:

```ts
interface TaskCountStat {
  total: number;
  open: number;
  closed: number;
  calculating?: boolean;
}

interface BoardStatsResponse {
  boardId: number;
  board: TaskCountStat;
  lists: Array<{
    listId: number;
    stats: TaskCountStat;
  }>;
}
```

Notes:

- The server should return one entry for every list on the board, including empty lists with zero counts.
- Query parameters should reflect only the board filters that are part of the counting model.
- The browser can request stats independently from board detail, or a future optimization may embed stats in board detail when that becomes worthwhile.

## Server computation model

Start with one dedicated server module that owns the counting rules.

Recommended responsibilities:

- resolve board + statuses
- normalize filter input
- build the set of closed status ids
- evaluate whether each task matches the active filter set
- aggregate board totals and per-list totals in one pass

Conceptually:

1. Load the board and status workflow data.
2. Normalize the incoming filter parameters.
3. Build `closedStatusIds`.
4. Iterate the board's tasks once.
5. For each matching task:
   - increment board `total`
   - increment board `open` or `closed`
   - increment the owning list's `total`
   - increment that list's `open` or `closed`

This gives a simple, correct baseline with one aggregation path shared by all consumers.

## Caching strategy

Recommended caching order:

### 1. Canonical compute first

Start with on-demand server aggregation and avoid persisted summary tables in the first version.

Reason:

- simpler correctness
- easier to evolve filters
- lower invalidation complexity

### 2. In-process memo cache

Add a server-side in-memory cache keyed by:

- `boardId`
- `board.updatedAt`
- normalized filter signature

This is a good fit for the current codebase because board/list/task writes already update `board.updated_at`, which gives a clean invalidation boundary for board-scoped stats.

### 3. Deeper runtime optimization

If needed, go one layer deeper and cache:

- the board-level aggregate
- each list aggregate
- or both as one cached response object

The cache should still be invalidated by `board.updatedAt` plus filter signature, not by ad hoc local heuristics.

### 4. Materialized counters later

Only if boards become large enough to justify it, consider persistent precomputed counters or summary tables. This is future tuning, not required for the initial design.

## Client integration model

The board page should consume stats as a separate read model.

Recommended flow:

1. Load board detail as today.
2. Resolve the active filter state.
3. Request board stats from the server using the normalized filter shape.
4. Render board chips and list chips from the stats response.
5. If the user changes filters or performs optimistic edits, optionally show a subtle in-chip calculating state while the stats query refreshes.

Optional enhancement:

- derive temporary optimistic counts in the browser from current board data while awaiting refreshed server stats

This gives a responsive UI without making the browser the long-term source of truth.

## Queries and client-side data loading

Stats add a **second** data dependency on top of board detail (`useBoard`). That can become heavy: every filter change can change the stats query key, and rapid toggles can multiply network work if not handled carefully.

**Goals**

- Avoid redundant fetches when board data and stats can be satisfied together or deduplicated.
- Keep invalidation predictable when mutations update the board cache.
- Leave room to optimize without rewriting UI.

**TanStack Query (recommended patterns)**

- **Dedicated query key** for stats, separate from `boardKeys.detail(id)` — e.g. `["boards", id, "stats", filterSignature]` where `filterSignature` is a stable string or hashed object derived from the normalized `BoardStatsFilter`. That way filter changes refetch stats without clobbering unrelated board cache entries.
- **`staleTime`**: stats may be safe to treat as fresh for a short window (e.g. a few seconds) while the user is only moving focus or scrolling, if product allows; tighten when filters change. Tune in implementation.
- **`placeholderData` / `keepPreviousData`**: when the filter changes, show previous stats until the new response arrives (pairs well with the in-chip loading indicator in requirements).
- **Deduplication**: identical concurrent requests (same key) should collapse to one in-flight fetch; rely on TanStack Query defaults unless profiling shows otherwise.
- **Coordination with board detail**: after task/list mutations that already write `Board` into the query cache, either invalidate the stats query for that board id or bump a `statsVersion`/`board.updatedAt` dependency so stats do not show stale totals. Prefer invalidation or a shared dependency on `board.updatedAt` from the latest `Board` in cache.

**When it gets heavy**

- Filter churn: debouncing stats refetch on rapid slider-like changes is optional; if not debounced, ensure the query key updates are cheap and cancellation aborts in-flight requests where supported.
- Large boards: pair client query discipline with server-side caching (see [Caching strategy](#caching-strategy)); consider prefetching stats alongside board detail in one round-trip only if measured benefit.
- **Future optimization**: embed stats in `GET /api/boards/:id` (or a batch endpoint) to halve round-trips; document as a tuning step in the plan, not a v1 requirement.

**Out of scope for this design section**

- Exact millisecond budgets — measure in the implementation phase.
- Service worker or offline stats — not assumed.

## UI state and persistence

The show/hide control for stats should be treated as a board-scoped view preference.

**Implementation:** `Board.showStats` maps to SQLite `board_view_prefs.show_counts`. The UI toggles it via `PATCH .../view-prefs` with `showStats` (legacy body key `showCounts` is still accepted server-side).

## Concerns to record

### CLI and external writers

Even if CLI writes are not part of the first implementation, this feature should be designed so that stats remain correct when boards are mutated outside the current browser session. That is the main reason to keep the server/API as the canonical stats layer. The board page can still be fast and optimistic, but a reusable server stats service prevents the logic from being trapped inside the React UI and keeps a future CLI read command or reporting surface straightforward.

### Filter logic drift

The current board code already applies similar filter rules in multiple places, which creates a real risk that stats, visible tasks, keyboard navigation, and future reporting features could slowly diverge as filters evolve. The design should explicitly centralize the counting predicate and normalized filter shape so new filters are added once, in one place, rather than copied across board components and helper hooks.

## Out of scope for v1

- CLI write flows
- persistent aggregate tables
- search-driven statistics
- dashboard charts
- matched-versus-total chip displays such as `3/5`
- archived / deleted / hidden entity semantics
- URL-based persistence for stats visibility

## Future scope and tuning

- CLI read command for stats
- dashboard/reporting endpoints
- embedding stats in board detail when beneficial
- deeper per-list cache tuning
- materialized aggregates for very large boards
- extra count surfaces next to filter labels
