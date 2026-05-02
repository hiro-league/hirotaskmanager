# Statistics pages — product requirements (V1)

This document specifies **requirements only** for dedicated **statistics** views: one scoped to a **single board**, and one **global** (workspace-wide). It does **not** cover layout, visuals, navigation, or implementation. For inline **L / T / O / C** chips on the board page, see [Board statistics requirements](./completed-plans/board-stats-requirements.md).

## Purpose

Give a solo developer a **read-only** overview of task volume and flow **without** replacing the board as the primary work surface. V1 stays **small**: a few clear metrics, a small set of breakdowns, and minimal filters.

## Persona

- **Primary:** solo developer using the product day to day.
- **Implication:** prioritize clarity and low ceremony over executive rollups or multi-user slices.

## Definitions

- **Active task / list / board** — same as elsewhere in the product: entities that are **not** “effectively trashed” (task, its list, and its board are all active). See [Trash requirements](./completed-plans/trash-requirements.md).
- **Done (closed)** — a task whose **current** workflow status is **closed** (`isClosed === true` in the board status model), consistent with [Board statistics requirements](./completed-plans/board-stats-requirements.md).
- **Open** — active task that is **not** done.
- **Statistics scope** — all metrics and counts on these pages count **only active** tasks (and active lists/boards as appropriate). **Trashed or effectively trashed data is completely excluded**; it must not appear in totals or breakdowns.

## Scope — two pages

### 1. Per-board statistics page

- **Input:** exactly **one** board (the board the user opened this view for).
- **Output:** metrics and breakdowns **for that board only**, subject to the filters below.

### 2. Global statistics page

- **Input:** the user’s workspace (all boards they can see).
- **Output:** a **rollup across boards** plus a way to **compare boards** at a glance (see metrics), subject to the filters below.

## Time period (required filter)

- Both pages MUST support a **single reporting period** for **time-based** metrics (e.g. completions and creations in that window).
- **V1:** offer a **small set of presets** (exact labels and values are not specified here). **No** requirement for “vs previous period” or trend comparison in V1—**absolute counts within the chosen period** are sufficient.
- Metrics that are **not** inherently time-bound (e.g. current **open** task count) MUST be defined explicitly (see below) so they do not confuse users when the period changes.

### Required semantics: snapshot vs period

| Metric | Semantics (V1) |
|--------|----------------|
| **Open tasks** | Count of **active, open** tasks **as of now** (current snapshot). **Independent** of the selected period; the period filter does not narrow this number. |
| **Done in period** | Count of **active** tasks whose **`closedAt`** falls in the selected period (see the paragraph immediately below). |
| **Created in period** | Count of **active** tasks with **creation timestamp** in the selected period. |

**Done in period:** count tasks whose **`closedAt`** timestamp falls in the selected period. The product sets **`closedAt`** when a task enters a closed status and clears it when reopening; “done” for statistics matches **closed status**.

## Release (filter and breakdown)

- **Releases are normal** for a solo dev workflow; the per-board page SHOULD allow constraining metrics to:
  - **all releases** (no constraint), **one** selected release, or **untagged** (no release), matching how the product models `releaseId` on tasks.
- The global page MAY support the same release filter **only if** it can be defined sensibly across boards (e.g. “untagged only,” or “ignore release filter globally”). If cross-board release filtering is ambiguous, **omit release filter on the global page in V1** and keep release only on the per-board page—implementation may choose either way as long as behavior is documented.

## Creation source (breakdown, not assignee)

- The product **does not** have assignees. It **does** record **who/what created** a task via **`createdByPrincipal`** (`web`, `cli`, `system` in the data model).
- **V1 requirement:** at least **one** breakdown or table column that groups or compares counts by **creation principal** for a clearly labeled slice (recommended: **Created in period** split by `web` / `cli` / `system`, and/or **Open** snapshot split the same way). Exact presentation is out of scope; the requirement is that users can see **human UI–originated** vs **CLI/automation–originated** vs **system** contribution at a high level.
- **Naming in the UI** is not specified here; the requirement is semantic alignment with the three principal values above.

## Per-board page — V1 content requirements

### Summary metrics (must have)

- **Open** (snapshot).
- **Done in period.**
- **Created in period.**

### Breakdowns (must have — keep to a small number)

- **By workflow status** — counts of **active** tasks on the board **grouped by current status** (each non-closed status plus one bucket for closed), so totals match **open + closed** for that board under the active-only rule.
- **By list (column)** — counts of **active** tasks per list on that board (same board as scope).

### Breakdowns (should have if not too heavy)

- **By task group** — counts per board task group.
- **By release** — counts per release plus untagged (can be redundant if release is already a filter; still useful as a table when filter is “all”).

### Optional V1 additions (nice-to-have, not mandatory)

- **By priority** — counts per board-defined priority.

## Global page — V1 content requirements

### Summary metrics (must have)

- **Open** (snapshot) — **workspace total** and/or sum consistent with per-board rules.
- **Done in period** — workspace total.
- **Created in period** — workspace total.

### Board comparison (must have)

- A **tabular** primary view: **one row per active board** with at least:
  - Board identity (name or stable label).
  - **Open** (snapshot).
  - **Done in period.**
  - **Created in period.**

Sorting default and sortable columns are **implementation/UX**, not specified here.

### Charts

- **No** requirement for charts on either page in V1. A future version may add **at most one** simple time series (e.g. done per day) if product needs it.

## Filters — summary

| Filter | Per-board | Global |
|--------|-----------|--------|
| Reporting period (presets) | Required | Required |
| Release (all / one / untagged) | Should | Optional (if semantics clear) |
| Status / list / group as *filters* | **Out of scope V1** (use breakdowns instead; avoid duplicating board filter bar) | **Out of scope V1** |

Search and board status visibility toggles from the main board view are **not** required to affect these pages in V1; statistics pages define their own scope (active tasks only + filters above).

## Non-goals (V1)

- Assignee or per-person workload (assignees do not exist).
- Period-over-period comparison and sparklines.
- Goals, SLAs, cycle time, lead time, or cumulative flow (unless later promoted with a separate spec).
- Deep linking of filter state in the URL.
- Including trashed or permanently deleted entities in any statistic.
- **Design and engineering:** API shape, caching, client vs server aggregation, and performance details—separate technical design.

## Related documents

- [Board statistics requirements](./completed-plans/board-stats-requirements.md) — inline chips, shared definitions for open/closed.
- [Trash requirements](./completed-plans/trash-requirements.md) — active vs trashed.
- [SQLite data model](./sqlite_data_model.md) — tasks, lists, releases, principals.
